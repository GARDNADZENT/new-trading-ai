import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'REVERSAL';
export const defaultSettings = {
  enabled: true,
  timeframes: ['M5', 'M15', 'H1'],
  minScore: 75,
  minRr: 2,
  lookbackBars: 20,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.reversal || {}), ...options };
  if (!settings.enabled) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  const currentPrice = (spec.ask + spec.bid) / 2;

  const data = await marketService.getChartHistory(symbol, settings.timeframes[0] || 'M5', 100);
  if (!data || !data.history || data.history.length < settings.lookbackBars) return null;

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
  const recentHigh = Math.max(...highs.slice(-settings.lookbackBars));
  const recentLow = Math.min(...lows.slice(-settings.lookbackBars));
  const currentEma20 = ema20 ? ema20[ema20.length - 1] : currentPrice;

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  if (trend.trend === 'BEARISH' && currentRsi < 35 && currentPrice < recentLow * 1.01) {
    direction = 'BUY';
    score += 35;
    reasons.push('Oversold bounce in downtrend');
  } else if (trend.trend === 'BULLISH' && currentRsi > 65 && currentPrice > recentHigh * 0.99) {
    direction = 'SELL';
    score += 35;
    reasons.push('Overbought pullback in uptrend');
  }

  if (currentRsi < 30) { score += 20; reasons.push('RSI oversold'); }
  if (currentRsi > 70) { score += 20; reasons.push('RSI overbought'); }
  if (currentPrice > currentEma20 && direction === 'BUY') { score += 15; reasons.push('Above EMA20'); }
  if (currentPrice < currentEma20 && direction === 'SELL') { score += 15; reasons.push('Below EMA20'); }
  if (currentAtr > currentPrice * 0.005) { score += 10; reasons.push('Volatility OK'); }

  if (score < settings.minScore) return null;

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const slDist = currentAtr * 2;
  const tpDist = currentAtr * 3;
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
    marketRegime: trend.trend === 'BULLISH' || trend.trend === 'BEARISH' ? 'TRENDING' : 'RANGING',
    timeframe: settings.timeframes[0],
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings };
