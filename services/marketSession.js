import config from '../config.js';
import { getInstrument } from './instrumentCatalog.js';

export function isWeekend(date = new Date()) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isCrypto(symbol) {
  return getInstrument(symbol)?.assetClass === 'CRYPTO';
}

export function getActivePairs(now, candidates) {
  const list = Array.isArray(candidates) ? candidates : (config.selectedPairs || []);
  return list.filter((sym) => isCrypto(sym) || !isWeekend(now));
}

export function isPairTradeableNow(symbol, now) {
  if (isCrypto(symbol)) return true;
  return !isWeekend(now);
}

export const marketSession = { isWeekend, isCrypto, getActivePairs, isPairTradeableNow };

export default marketSession;
