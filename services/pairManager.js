import config from '../config.js';
import axios from 'axios';
import { tradeService } from './tradeService.js';

const PYTHON_SERVER_URL = config.mt5Python?.url || process.env.MT5_PYTHON_SERVER_URL || 'http://localhost:8000';

const SUFFIX_VARIANTS = ['', 'm', '.s', '.', '_', '..', 'ecn', 'pro', 'c', 'i', '!', 'x'];

function normalizeSpec(raw, symbol) {
  if (!raw || raw.error) return null;
  const num = (v) => (v == null ? null : Number(v));
  return {
    symbol: raw.symbol || symbol,
    bid: num(raw.bid),
    ask: num(raw.ask),
    spread: num(raw.spread),
    digits: num(raw.digits),
    point: num(raw.point ?? raw.trade_tick_size),
    tick_size: num(raw.tick_size ?? raw.trade_tick_size),
    tick_value: num(raw.tick_value ?? raw.trade_tick_value),
    contract_size: num(raw.contract_size ?? raw.trade_contract_size),
    min_lot: num(raw.min_lot ?? raw.volume_min),
    max_lot: num(raw.max_lot ?? raw.volume_max),
    lot_step: num(raw.lot_step ?? raw.volume_step),
    stops_level: num(raw.stops_level),
    freeze_level: num(raw.freeze_level),
    trade_mode: num(raw.trade_mode),
    margin_initial: num(raw.margin_initial),
    margin_maintenance: num(raw.margin_maintenance),
    description: raw.description || null,
  };
}

export async function getSymbolSpec(symbol) {
  const raw = await tradeService.getSymbolInfo(symbol);
  if (!raw || raw.error) return null;
  const spec = normalizeSpec(raw, symbol);
  if (!spec || spec.ask == null || spec.bid == null) return null;
  return spec;
}

export async function discoverSymbol(base) {
  for (const suffix of SUFFIX_VARIANTS) {
    const candidate = `${base}${suffix}`;
    const spec = await getSymbolSpec(candidate);
    if (spec) return spec;
  }
  return null;
}

export function getSupportedPairs() {
  return config.supportedPairs || {};
}

export function getSelectedPairs() {
  return (config.selectedPairs || []).filter((p) => config.supportedPairs && config.supportedPairs[p]);
}

export function setSelectedPairs(pairs) {
  const valid = (pairs || []).filter((p) => config.supportedPairs && config.supportedPairs[p]);
  config.selectedPairs = [...new Set(valid)];
  return config.selectedPairs;
}

export async function checkPairAvailability(symbol) {
  const meta = config.supportedPairs[symbol];
  if (!meta) return { symbol, available: false, reason: 'Unknown pair' };
  const spec = await discoverSymbol(meta.base || symbol);
  if (spec) {
    return { symbol, available: true, actualSymbol: spec.symbol, spec };
  }
  const btcRelated = await discoverBtcSymbols();
  return {
    symbol,
    available: false,
    reason: 'Symbol not found on connected MT5 account/broker',
    btcRelated,
  };
}

export async function discoverBtcSymbols() {
  try {
    const response = await axios.get(`${PYTHON_SERVER_URL}/symbols`, {
      params: { query: 'BTC' },
      timeout: 10000,
    });
    const symbols = response.data?.symbols || [];
    return symbols.map((s) => ({
      symbol: s.symbol,
      description: s.description,
      visible: s.visible,
      trade_mode: s.trade_mode,
      bid: s.bid,
      ask: s.ask,
    }));
  } catch {
    return [];
  }
}

export async function getPairSnapshot(symbol) {
  const meta = config.supportedPairs[symbol];
  if (!meta) return { symbol, available: false, reason: 'Unknown pair' };
  const spec = await discoverSymbol(meta.base || symbol);
  if (!spec) {
    return { symbol, available: false, reason: 'Unavailable on this MT5 account/broker' };
  }
  return {
    symbol,
    label: meta.label,
    icon: meta.icon,
    available: true,
    actualSymbol: spec.symbol,
    spec,
  };
}

export const pairManager = {
  getSymbolSpec,
  discoverSymbol,
  getSupportedPairs,
  getSelectedPairs,
  setSelectedPairs,
  checkPairAvailability,
  discoverBtcSymbols,
  getPairSnapshot,
};

export default pairManager;
