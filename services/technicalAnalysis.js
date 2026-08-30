import { marketService } from './marketService.js';
import config from '../config.js';

class TechnicalAnalysis {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 60000;
  }

  async getSymbolData(symbol, timeframe = 'H1', count = 100) {
    const cacheKey = `${symbol}-${timeframe}-${count}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < this.cacheTTL) {
      return cached.data;
    }

    try {
      const data = await marketService.getChartHistory(symbol, timeframe, count);
      this.cache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } catch (err) {
      console.warn(`[TechnicalAnalysis] Failed to get data for ${symbol}:`, err.message);
      return null;
    }
  }

  calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k));
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    const rsi = [avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)];
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
      rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    }
    return rsi;
  }

  calculateATR(highs, lows, closes, period = 14) {
    if (!highs || !lows || !closes || highs.length < period + 1) return null;
    const tr = [];
    for (let i = 1; i < highs.length; i++) {
      const h = highs[i] - lows[i];
      const c = Math.abs(closes[i] - closes[i - 1]);
      const hl = Math.abs(highs[i] - closes[i - 1]);
      const ll = Math.abs(lows[i] - closes[i - 1]);
      tr.push(Math.max(h, hl, ll));
    }
    const atr = [tr.slice(0, period).reduce((a, b) => a + b, 0) / period];
    for (let i = period; i < tr.length; i++) {
      atr.push((atr[atr.length - 1] * (period - 1) + tr[i]) / period);
    }
    return atr;
  }

  detectTrend(prices, ema20, ema50) {
    if (!prices || prices.length < 2 || !ema20 || !ema50 || ema20.length < 2 || ema50.length < 2) {
      return { trend: 'NEUTRAL', strength: 0 };
    }

    const currentPrice = prices[prices.length - 1];
    const prevPrice = prices[prices.length - 2];
    const ema20Current = ema20[ema20.length - 1];
    const ema20Prev = ema20[ema20.length - 2];
    const ema50Current = ema50[ema50.length - 1];
    const ema50Prev = ema50[ema50.length - 2];

    let bullishCount = 0;
    let bearishCount = 0;

    if (currentPrice > ema20Current && ema20Current > ema50Current) bullishCount++;
    if (currentPrice < ema20Current && ema20Current < ema50Current) bearishCount++;
    if (ema20Current > ema50Current && ema20Prev > ema50Prev) bullishCount++;
    if (ema20Current < ema50Current && ema20Prev < ema50Prev) bearishCount++;
    if (currentPrice > prevPrice) bullishCount++;
    else bearishCount++;

    if (bullishCount >= 4) return { trend: 'BULLISH', strength: bullishCount };
    if (bearishCount >= 4) return { trend: 'BEARISH', strength: bearishCount };
    if (bullishCount >= 3) return { trend: 'BULLISH', strength: bullishCount };
    if (bearishCount >= 3) return { trend: 'BEARISH', strength: bearishCount };

    return { trend: 'NEUTRAL', strength: 0 };
  }

  async analyzeSymbol(symbol, timeframe = 'H1') {
    const data = await this.getSymbolData(symbol, timeframe, 100);
    if (!data || !data.history || !Array.isArray(data.history) || data.history.length < 50) {
      return null;
    }

    const candles = data.history;
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const ema20 = this.calculateEMA(closes, 20);
    const ema50 = this.calculateEMA(closes, 50);
    const rsi = this.calculateRSI(closes, 14);
    const atr = this.calculateATR(highs, lows, closes, 14);
    const trend = this.detectTrend(closes, ema20, ema50);

    const currentPrice = closes[closes.length - 1];
    const currentEma20 = ema20 ? ema20[ema20.length - 1] : null;
    const currentEma50 = ema50 ? ema50[ema50.length - 1] : null;
    const currentRsi = rsi ? rsi[rsi.length - 1] : null;
    const currentAtr = atr ? atr[atr.length - 1] : null;

    let signal = 'NEUTRAL';
    let confidence = 50;

    if (trend.trend === 'BULLISH' && currentRsi < 70 && currentRsi > 30) {
      signal = 'BUY';
      confidence = Math.min(90, 50 + trend.strength * 10);
    } else if (trend.trend === 'BEARISH' && currentRsi < 70 && currentRsi > 30) {
      signal = 'SELL';
      confidence = Math.min(90, 50 + trend.strength * 10);
    }

    return {
      symbol,
      timeframe,
      trend: trend.trend,
      trendStrength: trend.strength,
      signal,
      confidence,
      price: currentPrice,
      ema20: currentEma20,
      ema50: currentEma50,
      rsi: currentRsi,
      atr: currentAtr,
      support: Math.min(...lows.slice(-20)),
      resistance: Math.max(...highs.slice(-20)),
    };
  }
}

export const technicalAnalysis = new TechnicalAnalysis();
export default TechnicalAnalysis;
