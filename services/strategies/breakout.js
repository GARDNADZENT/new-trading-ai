import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'BREAKOUT';
export const allowedSymbols = ['XAUUSD', 'EURUSD'];
export const defaultSettings = {
  enabled: true,
  timeframes: ['M5', 'M15'],
  minScore: 70,
  consolidationBars: 15,
  minRr: 2,
};

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.breakout || {}), ...options };
  if (!settings.enabled) return null;

  if (!allowedSymbols.includes(symbol)) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const spread = spec.ask - spec.bid;
  const currentPrice = (spec.ask + spec.bid) / 2;

  const data = await marketService.getChartHistory(symbol, settings.timeframes[0] || 'M5', 100);
  if (!data || !data.history || data.history.length < settings.consolidationBars + 5) return null;

  const candles = data.history;
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);

  const consolidationHigh = Math.max(...highs.slice(-settings.consolidationBars));
  const consolidationLow = Math.min(...lows.slice(-settings.consolidationBars));
  const atr = technicalAnalysis.calculateATR(highs, lows, closes, 14);
  const currentAtr = atr ? atr[atr.length - 1] : 0;

  let score = 0;
  let direction = 'NO_TRADE';
  const reasons = [];

  if (currentPrice > consolidationHigh) {
    direction = 'BUY';
    score += 40;
    reasons.push(`Breakout above ${consolidationHigh.toFixed(5)}`);
  } else if (currentPrice < consolidationLow) {
    direction = 'SELL';
    score += 40;
    reasons.push(`Breakout below ${consolidationLow.toFixed(5)}`);
  }

  const rangeSize = consolidationHigh - consolidationLow;
  if (rangeSize > 0 && rangeSize < currentAtr * 3) {
    score += 20;
    reasons.push('Compressed range');
  }

  if (currentAtr > currentPrice * 0.005) {
    score += 20;
    reasons.push('Volatility expansion');
  }

  if (score < settings.minScore) return null;

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const slDist = currentAtr * 1.5;
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
    marketRegime: 'BREAKOUT',
    timeframe: settings.timeframes[0],
    timestamp: Date.now(),
  };
}

export default { name, scan, defaultSettings, allowedSymbols };
