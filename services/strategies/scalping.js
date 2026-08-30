import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { tradePlanner } from '../tradePlanner.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'SCALPING';
export const defaultSettings = {
  enabled: true,
  timeframes: ['M1', 'M5'],
  minScore: 65,
  requireConfluence: true,
  maxSpread: 3,
  minRr: 1.5,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.scalping || {}), ...options };
  if (!settings.enabled) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  if (spread > settings.maxSpread * (spec.point || 0.01)) {
    return { symbol, strategy: name, direction: 'NO_TRADE', score: 0, reason: `Spread too high: ${spread}` };
  }

  const tf = settings.timeframes[0] || 'M5';
  const data = await marketService.getChartHistory(symbol, tf, 100);
  if (!data || !data.history || data.history.length < 20) return null;

  const candles = data.history;
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  const ema20 = technicalAnalysis.calculateEMA(closes, 20);
  const ema50 = technicalAnalysis.calculateEMA(closes, 50);
  const rsi = technicalAnalysis.calculateRSI(closes, 14);
  const atr = technicalAnalysis.calculateATR(highs, lows, closes, 14);
  const trend = technicalAnalysis.detectTrend(closes, ema20, ema50);

  const currentRsi = rsi ? rsi[rsi.length - 1] : 50;
  const currentAtr = atr ? atr[atr.length - 1] : 0;
  const currentPrice = closes[closes.length - 1];
  const currentEma20 = ema20 ? ema20[ema20.length - 1] : currentPrice;
  const currentEma50 = ema50 ? ema50[ema50.length - 1] : currentPrice;

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  if (trend.trend === 'BULLISH') { score += 25; reasons.push('EMA bullish'); }
  if (trend.trend === 'BEARISH') { score += 25; reasons.push('EMA bearish'); }
  if (currentRsi > 30 && currentRsi < 70) { score += 15; reasons.push('RSI neutral'); }
  if (currentRsi < 35) { score += 10; direction = 'BUY'; reasons.push('RSI oversold'); }
  if (currentRsi > 65) { score += 10; direction = 'SELL'; reasons.push('RSI overbought'); }
  if (currentAtr > 0 && currentAtr < currentPrice * 0.01) { score += 15; reasons.push('Low volatility'); }
  if (currentPrice > currentEma20 && currentEma20 > currentEma50) { score += 20; direction = 'BUY'; reasons.push('Price above EMA20/50'); }
  if (currentPrice < currentEma20 && currentEma20 < currentEma50) { score += 20; direction = 'SELL'; reasons.push('Price below EMA20/50'); }

  if (score < settings.minScore) return null;

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const slDist = currentAtr * 1.5;
  const tpDist = currentAtr * 2.5;
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
    timeframe: tf,
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings };
