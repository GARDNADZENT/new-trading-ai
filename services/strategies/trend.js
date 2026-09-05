import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'TREND';
export const allowedSymbols = ['XAUUSD'];
export const defaultSettings = {
  enabled: true,
  timeframes: ['H1', 'H4'],
  minScore: 70,
  requirePullback: true,
  minRr: 2,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.trend || {}), ...options };
  if (!settings.enabled) return null;

  if (!allowedSymbols.includes(symbol)) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  const currentPrice = (spec.ask + spec.bid) / 2;

  const data = await marketService.getChartHistory(symbol, settings.timeframes[0] || 'H1', 100);
  if (!data || !data.history || data.history.length < 50) return null;

  const candles = data.history;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const ema20 = technicalAnalysis.calculateEMA(closes, 20);
  const ema50 = technicalAnalysis.calculateEMA(closes, 50);
  const atr = technicalAnalysis.calculateATR(highs, lows, closes, 14);
  const trend = technicalAnalysis.detectTrend(closes, ema20, ema50);

  const currentAtr = atr ? atr[atr.length - 1] : 0;
  const currentEma20 = ema20 ? ema20[ema20.length - 1] : currentPrice;
  const currentEma50 = ema50 ? ema50[ema50.length - 1] : currentPrice;
  const recentHigh = Math.max(...highs.slice(-20));
  const recentLow = Math.min(...lows.slice(-20));
  const pullback = trend.trend === 'BULLISH'
    ? currentPrice < recentHigh && currentPrice > currentEma20
    : trend.trend === 'BEARISH'
      ? currentPrice > recentLow && currentPrice < currentEma20
      : false;

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  if (trend.trend === 'BULLISH' && trend.strength >= 3) { score += 30; direction = 'BUY'; reasons.push('Uptrend'); }
  if (trend.trend === 'BEARISH' && trend.strength >= 3) { score += 30; direction = 'SELL'; reasons.push('Downtrend'); }
  if (currentPrice > currentEma20 && currentEma20 > currentEma50) { score += 20; reasons.push('Bullish MA alignment'); }
  if (currentPrice < currentEma20 && currentEma20 < currentEma50) { score += 20; reasons.push('Bearish MA alignment'); }
  if (settings.requirePullback && pullback) { score += 20; reasons.push('Pullback to support/resistance'); }
  if (currentAtr > currentPrice * 0.005) { score += 10; reasons.push('Volatility OK'); }

  if (score < settings.minScore) return null;

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const slDist = currentAtr * 2;
  const tpDist = currentAtr * 4;
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
    marketRegime: 'TRENDING',
    timeframe: settings.timeframes[0],
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings, allowedSymbols };
