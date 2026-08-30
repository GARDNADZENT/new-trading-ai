import config from '../config.js';

const CRYPTO_PAIRS = new Set(['BTCUSD']);

export function isWeekend(date = new Date()) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

export function isCrypto(symbol) {
  return CRYPTO_PAIRS.has(symbol);
}

export function getActivePairs(now) {
  const selected = (config.selectedPairs || []).filter((p) => config.supportedPairs && config.supportedPairs[p]);
  return selected.filter((sym) => isCrypto(sym) || !isWeekend(now));
}

export function isPairTradeableNow(symbol, now) {
  if (isCrypto(symbol)) return true;
  return !isWeekend(now);
}

export const marketSession = { isWeekend, isCrypto, getActivePairs, isPairTradeableNow };

export default marketSession;
