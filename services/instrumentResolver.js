import axios from 'axios';
import config from '../config.js';
import { INSTRUMENT_CATALOG, getInstrument, getAliases, getKeywords } from './instrumentCatalog.js';
import { tradeService } from './tradeService.js';

const PYTHON_SERVER_URL = config.mt5Python?.url || process.env.MT5_PYTHON_SERVER_URL || 'http://127.0.0.1:8000';

const symbolCache = new Map();
const catalogCache = new Map();
const RESOLVED_CACHE_TTL_MS = 5 * 60 * 1000;
const UNRESOLVED_CACHE_TTL_MS = 15 * 1000;
const BROKER_IDENTITY_CHECK_MS = 10 * 1000;

let brokerIdentity = null;
let lastBrokerIdentityCheck = 0;
let brokerIdentityCheckPromise = null;

function getCachedResolution(instrumentId) {
  const cached = catalogCache.get(instrumentId);
  if (!cached || cached.expiresAt <= Date.now()) {
    catalogCache.delete(instrumentId);
    return { hit: false, value: null };
  }
  return { hit: true, value: cached.value };
}

function cacheResolution(instrumentId, value) {
  catalogCache.set(instrumentId, {
    value,
    expiresAt: Date.now() + (value ? RESOLVED_CACHE_TTL_MS : UNRESOLVED_CACHE_TTL_MS),
  });
}

async function refreshBrokerIdentity() {
  const now = Date.now();
  if (now - lastBrokerIdentityCheck < BROKER_IDENTITY_CHECK_MS) return brokerIdentity;
  if (brokerIdentityCheckPromise) return brokerIdentityCheckPromise;

  brokerIdentityCheckPromise = axios.get(`${PYTHON_SERVER_URL}/health`, { timeout: 5000 })
    .then((response) => {
      const health = response.data || {};
      if (health.status !== 'connected' || health.login == null || !health.server) return brokerIdentity;

      const nextIdentity = `${health.server}:${health.login}`;
      if (brokerIdentity && brokerIdentity !== nextIdentity) {
        console.log(`[InstrumentResolver] Broker changed (${brokerIdentity} -> ${nextIdentity}); refreshing symbol mappings.`);
        symbolCache.clear();
        catalogCache.clear();
      }
      brokerIdentity = nextIdentity;
      return brokerIdentity;
    })
    .catch(() => brokerIdentity)
    .finally(() => {
      lastBrokerIdentityCheck = Date.now();
      brokerIdentityCheckPromise = null;
    });

  return brokerIdentityCheckPromise;
}

function normalize(s) {
  return String(s || '').toUpperCase().replace(/[\s_.\-]+/g, '');
}

function buildSearchTerms(instrument) {
  const terms = new Set();
  for (const a of [instrument.id, ...(instrument.aliases || [])]) {
    terms.add(a);
    terms.add(normalize(a));
  }
  for (const k of instrument.keywords || []) {
    terms.add(k);
    terms.add(normalize(k));
  }
  return [...terms];
}

function scoreMatch(candidate, instrument) {
  const candNorm = normalize(candidate.symbol);
  if (!candNorm) return 0;

  // 1. Exact match on canonical id.
  if (candidate.symbol.toUpperCase() === instrument.id) return 100;
  if (candNorm === normalize(instrument.id)) return 99;

  // 2. Exact match on an alias.
  for (const a of instrument.aliases || []) {
    if (candidate.symbol.toUpperCase() === a.toUpperCase()) return 98;
    if (candNorm === normalize(a)) return 97;
  }

  // 3. Keyword inclusion (high confidence when symbol contains keyword).
  let best = 0;
  for (const k of instrument.keywords || []) {
    if (!k) continue;
    const kNorm = normalize(k);
    if (candNorm.includes(kNorm)) {
      const score = 90 - Math.max(0, candNorm.length - kNorm.length);
      if (score > best) best = score;
    }
  }
  return best;
}

async function getAllBrokerSymbols() {
  try {
     const r = await axios.get(`${PYTHON_SERVER_URL}/symbols`, { timeout: 30000 });
    return r.data?.symbols || [];
  } catch {
    return [];
  }
}

async function trySelectable(spec) {
  if (!spec || !spec.symbol) return null;
  try {
    const raw = await tradeService.getSymbolInfo(spec.symbol);
    if (!raw || raw.error) return null;
    return raw;
  } catch {
    return null;
  }
}

async function resolveInstrument(instrumentId) {
  const instrument = getInstrument(instrumentId);
  if (!instrument) return null;

  await refreshBrokerIdentity();
  const cached = getCachedResolution(instrumentId);
  if (cached.hit) return cached.value;

  // Phase 1: probe canonical + aliases directly via /symbol-info.
  for (const alias of [instrument.id, ...(instrument.aliases || [])]) {
    const spec = await trySelectable({ symbol: alias });
    if (spec && (spec.bid != null || spec.ask != null || spec.spread != null || spec.digits != null)) {
      const result = { instrument, actualSymbol: spec.symbol || alias, spec, source: 'direct' };
      cacheResolution(instrumentId, result);
      return result;
    }
  }

  // Phase 2: fuzzy match against the broker's full symbol list.
  const all = await getAllBrokerSymbols();
  if (all.length) {
    let best = null;
    let bestScore = 0;
    for (const c of all) {
      const s = scoreMatch(c, instrument);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best && bestScore >= 80 && best.trade_mode !== 0) {
      const spec = await trySelectable({ symbol: best.symbol });
      if (spec) {
        const result = { instrument, actualSymbol: spec.symbol || best.symbol, spec, source: 'fuzzy' };
        cacheResolution(instrumentId, result);
        return result;
      }
    }
  }

  cacheResolution(instrumentId, null);
  return null;
}

export async function resolveInstruments(ids) {
  const out = {};
  for (const id of ids || []) {
    out[id] = await resolveInstrument(id);
  }
  return out;
}

export async function resolveAll() {
  return resolveInstruments(Object.keys(INSTRUMENT_CATALOG));
}

export async function resolveOne(id) {
  return resolveInstrument(id);
}

export async function getInstrumentSnapshot(id) {
  const r = await resolveInstrument(id);
  if (!r) return { id, available: false, reason: 'Not found on connected broker', alternatives: await suggestAlternatives(id) };
  return {
    id,
    available: true,
    actualSymbol: r.actualSymbol,
    label: r.instrument.label,
    icon: r.instrument.icon,
    assetClass: r.instrument.assetClass,
    spec: r.spec,
    source: r.source,
  };
}

export async function suggestAlternatives(id) {
  const instrument = getInstrument(id);
  if (!instrument) return [];
  const all = await getAllBrokerSymbols();
  const scored = all
    .map((c) => ({ symbol: c.symbol, description: c.description, score: scoreMatch(c, instrument) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  return scored;
}

export function clearResolverCache() {
  symbolCache.clear();
  catalogCache.clear();
  lastBrokerIdentityCheck = 0;
}

export const instrumentResolver = {
  resolveOne,
  resolveAll,
  resolveInstruments,
  getInstrumentSnapshot,
  suggestAlternatives,
  clearResolverCache,
};

export default instrumentResolver;
