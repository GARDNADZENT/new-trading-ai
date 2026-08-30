import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { pairManager } from '../pairManager.js';
import config from '../../config.js';

export function detectRegime(candles, atr, price) {
  if (!candles || !candles.length || !atr || !price) return 'UNCLEAR';

  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const lastClose = closes[closes.length - 1];
  const range = Math.max(...highs.slice(-20)) - Math.min(...lows.slice(-20));
  const avgRange = range / 20;
  const atrPercent = atr / lastClose;

  const ema20 = technicalAnalysis.calculateEMA(closes, 20);
  const ema50 = technicalAnalysis.calculateEMA(closes, 50);
  if (!ema20 || !ema50 || ema20.length < 2 || ema50.length < 2) return 'UNCLEAR';

  const e20 = ema20[ema20.length - 1];
  const e50 = ema50[ema50.length - 1];
  const e20Prev = ema20[ema20.length - 2];
  const e50Prev = ema50[ema50.length - 2];

  const trendStrength = technicalAnalysis.detectTrend(closes, ema20, ema50);

  if (atrPercent > 0.03) return 'EXTREME';
  if (atrPercent > 0.015) return 'HIGH_VOLATILITY';

  if (trendStrength.trend === 'BULLISH' && trendStrength.strength >= 3) return 'TRENDING';
  if (trendStrength.trend === 'BEARISH' && trendStrength.strength >= 3) return 'TRENDING';

  if (range > 0 && avgRange > 0 && atrPercent < 0.005) {
    const inRange = lastClose > Math.min(...lows.slice(-20)) && lastClose < Math.max(...highs.slice(-20));
    if (inRange) return 'RANGING';
  }

  if (trendStrength.trend === 'BULLISH' || trendStrength.trend === 'BEARISH') return 'TRENDING';

  return 'UNCLEAR';
}

export async function getMarketRegime(symbol, timeframe = 'M5', count = 100) {
  try {
    const data = await marketService.getChartHistory(symbol, timeframe, count);
    if (!data || !data.history || !Array.isArray(data.history) || data.history.length < 20) {
      return { regime: 'UNCLEAR', reason: 'Insufficient data' };
    }

    const candles = data.history;
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const atr = technicalAnalysis.calculateATR(highs, lows, closes, 14);
    const currentAtr = atr ? atr[atr.length - 1] : 0;
    const regime = detectRegime(candles, currentAtr, closes[closes.length - 1]);

    return {
      regime,
      atr: currentAtr,
      trend: technicalAnalysis.detectTrend(closes, technicalAnalysis.calculateEMA(closes, 20), technicalAnalysis.calculateEMA(closes, 50)),
      volatility: currentAtr / (closes[closes.length - 1] || 1),
    };
  } catch (err) {
    return { regime: 'UNCLEAR', reason: err.message };
  }
}

export default { detectRegime, getMarketRegime };
