import { INSTRUMENT_CATALOG, listInstruments, getInstrument, getAliases, getKeywords } from './instrumentCatalog.js';
import { instrumentResolver, resolveOne, resolveAll, resolveInstruments, getInstrumentSnapshot, suggestAlternatives, clearResolverCache } from './instrumentResolver.js';
import config from '../config.js';

const DEFAULT_PLAN = {
  atrPeriod: 14,
  slAtrMult: 2,
  tpAtrMult: 4,
  maxAtrMult: 3,
  minRiskReward: 2,
  lookbackCandles: 60,
};

const CRYPTO_PLAN = { ...DEFAULT_PLAN, slAtrMult: 2.5, tpAtrMult: 5, maxAtrMult: 4 };
const INDEX_PLAN = { ...DEFAULT_PLAN, slAtrMult: 1.5, tpAtrMult: 3, maxAtrMult: 2.5 };

function planFor(id) {
  if (config.pairPlanner?.[id]) return config.pairPlanner[id];
  const meta = getInstrument(id);
  if (!meta) return DEFAULT_PLAN;
  if (meta.assetClass === 'CRYPTO') return CRYPTO_PLAN;
  if (meta.assetClass === 'INDEX') return INDEX_PLAN;
  return DEFAULT_PLAN;
}

export async function getPairSnapshot(id) {
  const snap = await getInstrumentSnapshot(id);
  if (snap.available) {
    return {
      symbol: id,
      label: snap.label,
      icon: snap.icon,
      available: true,
      actualSymbol: snap.actualSymbol,
      assetClass: snap.assetClass,
      spec: snap.spec,
      plan: planFor(id),
    };
  }
  return snap;
}

export function getSupportedPairs() {
  return INSTRUMENT_CATALOG;
}

export function getSelectedPairs() {
  return (config.selectedPairs || config.selectedInstruments || []).filter((p) => INSTRUMENT_CATALOG[p]);
}

export function setSelectedPairs(pairs) {
  const valid = (pairs || []).filter((p) => INSTRUMENT_CATALOG[p]);
  config.selectedPairs = [...new Set(valid)];
  config.selectedInstruments = [...config.selectedPairs];
  return config.selectedPairs;
}

export const pairManager = {
  getSupportedPairs,
  listInstruments,
  getInstrument,
  getAliases,
  getKeywords,
  getSelectedPairs,
  setSelectedPairs,
  getPairSnapshot,
  resolveInstrument: resolveOne,
  resolveInstruments,
  resolveAll,
  planFor,

  clearSymbolCache: clearResolverCache,
};

export { INSTRUMENT_CATALOG, listInstruments, getInstrument, instrumentResolver };
export default pairManager;
