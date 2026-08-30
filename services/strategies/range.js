import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'RANGE';
export const defaultSettings = {
  enabled: true,
  timeframes: ['M5', 'M15', 'H1'],
  minScore: 70,
  rangeLookback: 20,
  touchThreshold: 2,
  minRr: 1.5,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.range || {}), ...options };
  if (!settings.enabled) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  const currentPrice = (spec.ask + spec.bid) / 2;

  const data = await marketService.getChartHistory(symbol, settings.timeframes[0] || 'M5', 100);
  if (!data || !data.history || data.history.length < settings.rangeLookback) return null;

  const candles = data.history;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const rangeHigh = Math.max(...highs.slice(-settings.rangeLookback));
  const rangeLow = Math.min(...lows.slice(-settings.rangeLookback));
  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize <= 0) return null;

  const atr = technicalAnalysis.calculateATR(highs, lows, closes, 14);
  const currentAtr = atr ? atr[atr.length - 1] : 0;

  let touchesHigh = 0;
  let touchesLow = 0;
  for (let i = candles.length - settings.rangeLookback; i < candles.length; i++) {
    if (candles[i].high >= rangeHigh - rangeSize * 0.02) touchesHigh++;
    if (candles[i].low <= rangeLow + rangeSize * 0.02) touchesLow++;
  }

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  const nearHigh = currentPrice > rangeHigh - rangeSize * 0.1;
  const nearLow = currentPrice < rangeLow + rangeSize * 0.1;

  if (nearHigh && touchesHigh >= settings.touchThreshold && currentPrice < spec.ask) {
    direction = 'SELL';
    score += 40;
    reasons.push('Rejection at range high');
  } else if (nearLow && touchesLow >= settings.touchThreshold && currentPrice > spec.bid) {
    direction = 'BUY';
    score += 40;
    reasons.push('Rejection at range low');
  }

  if (rangeSize < currentAtr * 4) { score += 20; reasons.push('Compact range'); }
  if (currentAtr > currentPrice * 0.002 && currentAtr < currentPrice * 0.01) { score += 20; reasons.push('Range volatility OK'); }

  if (score < settings.minScore) return null;

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const slDist = rangeSize * 0.3;
  const tpDist = rangeSize * 0.6;
  const stopLoss = direction === 'BUY' ? entry - slDist : entry + slDist;
  const takeProfit = direction === 'BUY' ? entry + tpDist : entry - tpDist;

  const integrity = runMarketIntegrityChecks({
    symbol, spread, volatility: currentAtr / (currentPrice || 1), priceValid: true,
    marketStatus: true, tradeMode: 1, lotSize: 0.01, spec, direction, entry, stopLoss, takeProfit,
  });
  if (!integrity.approved) return null;

  return {
    symbol,
    strategy: name,
    direction,
    score: Math.min(100, score),
    entry,
    stopLoss,
    takeProfit,
    confidence: score,
    reason: reasons.join(' + '),
    marketRegime: 'RANGING',
    timeframe: settings.timeframes[0],
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings };
