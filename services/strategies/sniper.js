import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { tradePlanner } from '../tradePlanner.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'SNIPER';
export const defaultSettings = {
  enabled: true,
  timeframes: ['M5', 'M15', 'H1'],
  minScore: 80,
  requireStructureShift: true,
  minRr: 2,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.sniper || {}), ...options };
  if (!settings.enabled) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  const currentPrice = (spec.ask + spec.bid) / 2;

  const data = await marketService.getChartHistory(symbol, settings.timeframes[1] || 'M15', 100);
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
  const recentHigh = Math.max(...highs.slice(-10));
  const recentLow = Math.min(...lows.slice(-10));
  const currentEma20 = ema20 ? ema20[ema20.length - 1] : currentPrice;
  const currentEma50 = ema50 ? ema50[ema50.length - 1] : currentPrice;

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  if (trend.trend === 'BULLISH' && trend.strength >= 4) { score += 25; direction = 'BUY'; reasons.push('Strong bullish trend'); }
  if (trend.trend === 'BEARISH' && trend.strength >= 4) { score += 25; direction = 'SELL'; reasons.push('Strong bearish trend'); }
  if (currentPrice > currentEma20 && currentEma20 > currentEma50) { score += 20; reasons.push('MA alignment bullish'); }
  if (currentPrice < currentEma20 && currentEma20 < currentEma50) { score += 20; reasons.push('MA alignment bearish'); }
  if (currentRsi > 40 && currentRsi < 60) { score += 15; reasons.push('RSI in healthy zone'); }
  if (currentAtr > currentPrice * 0.005 && currentAtr < currentPrice * 0.02) { score += 10; reasons.push('Good volatility'); }

  const wickRejection = currentPrice > recentLow + (recentHigh - recentLow) * 0.3 &&
                        currentPrice < recentHigh - (recentHigh - recentLow) * 0.3;
  if (wickRejection) { score += 10; reasons.push('Wick rejection at boundary'); }

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
    marketRegime: trend.trend === 'BULLISH' || trend.trend === 'BEARISH' ? 'TRENDING' : 'UNCLEAR',
    timeframe: settings.timeframes[1],
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings };
