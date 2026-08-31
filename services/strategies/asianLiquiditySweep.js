import { technicalAnalysis } from '../technicalAnalysis.js';
import { marketService } from '../marketService.js';
import { runMarketIntegrityChecks } from '../marketIntegrity.js';
import config from '../../config.js';

export const name = 'ASIAN_LIQUIDITY_SWEEP';
export const allowedSymbols = ['XAUUSD', 'EURUSD'];
export const defaultSettings = {
  enabled: true,
  asianSessionStartHour: 0,
  asianSessionEndHour: 8,
  riskPercent: 0.5,
  slBufferPoints: 10,
  slOffsetPoints: 20,
  slMode: 3,
  useOppositeAsianTP: true,
  obMitigationPercent: 50,
  obMitigationMin: 40,
  obMitigationMax: 75,
  obLookbackBars: 10,
  swingLookback: 3,
  displacementBodyPct: 60,
  displacementAtrMult: 1.2,
  maxTradesPerDay: 3,
  maxSpreadPoints: 30,
  minRr: 1.5,
};

function getPointSize(spec) {
  return spec.point || 0.001;
}

function pointsToPrice(points, pointSize) {
  return points * pointSize * 10;
}

function getCurrentHour() {
  const now = new Date();
  return now.getUTCHours();
}

function calculateAsianRange(m15Data, startHour, endHour) {
  if (!m15Data || !m15Data.history || m15Data.history.length === 0) {
    return null;
  }

  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);

  const sessionStart = new Date(today);
  sessionStart.setUTCHours(startHour, 0, 0, 0);

  const sessionEnd = new Date(today);
  sessionEnd.setUTCHours(endHour, 0, 0, 0);

  if (startHour > endHour) {
    sessionStart.setUTCDate(sessionStart.getUTCDate() - 1);
  }

  const startMs = sessionStart.getTime();
  const endMs = sessionEnd.getTime();

  const sessionCandles = m15Data.history.filter(c => {
    const t = c.time * 1000;
    return t >= startMs && t <= endMs;
  });

  if (sessionCandles.length === 0) return null;

  let high = -Infinity;
  let low = Infinity;

  for (const c of sessionCandles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
  }

  return {
    high,
    low,
    mid: (high + low) / 2,
  };
}

function detectSweep(currentPrice, asianRange) {
  if (!asianRange) return 'NONE';

  if (currentPrice > asianRange.high) return 'HIGH';
  if (currentPrice < asianRange.low) return 'LOW';

  return 'NONE';
}

function calculateATR(candles, period = 14) {
  if (!candles || candles.length < period + 1) return 0;

  const trueRanges = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high - candles[i].low;
    const hl = Math.abs(candles[i].high - candles[i - 1].close);
    const ll = Math.abs(candles[i].low - candles[i - 1].close);
    trueRanges.push(Math.max(h, hl, ll));
  }

  if (trueRanges.length < period) return trueRanges[0] || 0;

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

function detectBearishOrderBlock(candles, atr, settings) {
  if (!candles || candles.length < settings.obLookbackBars + settings.swingLookback * 2 + 10) {
    return null;
  }

  const minRange = atr * 1.0;

  for (let i = 2; i < candles.length - settings.swingLookback - 2; i++) {
    const obCandle = candles[i];
    const dispCandle = candles[i - 1];

    const bodySize = Math.abs(dispCandle.close - dispCandle.open);
    const totalRange = dispCandle.high - dispCandle.low;

    if (totalRange <= 0) continue;

    const bodyPct = (bodySize / totalRange) * 100;
    if (bodyPct < settings.displacementBodyPct) continue;

    if (dispCandle.close >= dispCandle.open) continue;
    if (totalRange < minRange) continue;

    if (!(obCandle.close > obCandle.open)) continue;

    return {
      high: obCandle.high,
      low: obCandle.low,
      time: obCandle.time,
    };
  }

  return null;
}

function detectBullishOrderBlock(candles, atr, settings) {
  if (!candles || candles.length < settings.obLookbackBars + settings.swingLookback * 2 + 10) {
    return null;
  }

  const minRange = atr * 1.0;

  for (let i = 2; i < candles.length - settings.swingLookback - 2; i++) {
    const obCandle = candles[i];
    const dispCandle = candles[i - 1];

    const bodySize = Math.abs(dispCandle.close - dispCandle.open);
    const totalRange = dispCandle.high - dispCandle.low;

    if (totalRange <= 0) continue;

    const bodyPct = (bodySize / totalRange) * 100;
    if (bodyPct < settings.displacementBodyPct) continue;

    if (dispCandle.close <= dispCandle.open) continue;
    if (totalRange < minRange) continue;

    if (!(obCandle.close < obCandle.open)) continue;

    return {
      high: obCandle.high,
      low: obCandle.low,
      time: obCandle.time,
    };
  }

  return null;
}

function checkBearishBOS(candles, atr) {
  if (!candles || candles.length < 10) return false;

  const swingLookback = 3;
  let recentHigh = -Infinity;

  for (let i = 0; i < swingLookback + 2; i++) {
    if (candles[i].high > recentHigh) recentHigh = candles[i].high;
  }

  for (let i = 0; i < Math.min(8, candles.length); i++) {
    if (candles[i].close < candles[i].open) {
      if (candles[i].high - candles[i].low > atr * 0.8) {
        return true;
      }
    }
  }

  return false;
}

function checkBullishBOS(candles, atr) {
  if (!candles || candles.length < 10) return false;

  const swingLookback = 3;
  let recentLow = Infinity;

  for (let i = 0; i < swingLookback + 2; i++) {
    if (candles[i].low < recentLow) recentLow = candles[i].low;
  }

  for (let i = 0; i < Math.min(8, candles.length); i++) {
    if (candles[i].close > candles[i].open) {
      if (candles[i].high - candles[i].low > atr * 0.8) {
        return true;
      }
    }
  }

  return false;
}

function checkMitigationOnM1(m1Candles, orderBlock, direction, settings) {
  if (!m1Candles || m1Candles.length === 0 || !orderBlock) {
    return { mitigated: false, level: 0 };
  }

  const obRange = orderBlock.high - orderBlock.low;
  const currentCandle = m1Candles[0];

  if (direction === 'SELL') {
    const minMitigation = orderBlock.low + (settings.obMitigationMin / 100) * obRange;
    const prefMitigation = orderBlock.low + (settings.obMitigationPercent / 100) * obRange;

    if (currentCandle.high >= minMitigation) {
      const mitigationLevel = Math.max(currentCandle.high, prefMitigation);

      if (currentCandle.close < currentCandle.open) {
        return { mitigated: true, level: mitigationLevel };
      }
      if (currentCandle.close < mitigationLevel) {
        return { mitigated: true, level: mitigationLevel };
      }
    }
  } else if (direction === 'BUY') {
    const maxMitBuy = orderBlock.high - (settings.obMitigationMin / 100) * obRange;
    const prefMitBuy = orderBlock.high - (settings.obMitigationPercent / 100) * obRange;

    if (currentCandle.low <= maxMitBuy) {
      const mitigationLevel = Math.min(currentCandle.low, prefMitBuy);

      if (currentCandle.close > currentCandle.open) {
        return { mitigated: true, level: mitigationLevel };
      }
      if (currentCandle.close > mitigationLevel) {
        return { mitigated: true, level: mitigationLevel };
      }
    }
  }

  return { mitigated: false, level: 0 };
}

function calculateStopLoss(direction, orderBlock, sweepPrice, settings, spec) {
  const pointSize = getPointSize(spec);

  if (settings.slMode === 1) {
    if (direction === 'SELL') {
      return orderBlock.high + pointsToPrice(settings.slBufferPoints, pointSize);
    } else {
      return orderBlock.low - pointsToPrice(settings.slBufferPoints, pointSize);
    }
  } else if (settings.slMode === 2) {
    if (direction === 'SELL') {
      return sweepPrice + pointsToPrice(settings.slOffsetPoints, pointSize);
    } else {
      return sweepPrice - pointsToPrice(settings.slOffsetPoints, pointSize);
    }
  } else {
    if (direction === 'SELL') {
      return orderBlock.high + pointsToPrice(settings.slBufferPoints, pointSize);
    } else {
      return orderBlock.low - pointsToPrice(settings.slBufferPoints, pointSize);
    }
  }
}

function calculateTakeProfit(direction, asianRange, settings) {
  if (settings.useOppositeAsianTP && asianRange) {
    if (direction === 'SELL') {
      return asianRange.low;
    } else {
      return asianRange.high;
    }
  }
  return 0;
}

export async function scan(symbol, marketData, options = {}) {
  const settings = { ...defaultSettings, ...(config.strategies?.asianLiquiditySweep || {}), ...options };
  if (!settings.enabled) return null;

  if (!allowedSymbols.includes(symbol)) return null;

  const spec = marketData?.spec || marketData;
  if (!spec || !spec.ask || !spec.bid) return null;

  const currentPrice = (spec.ask + spec.bid) / 2;
  const spread = spec.ask - spec.bid;
  const spreadPoints = spread / getPointSize(spec);

  if (spreadPoints > settings.maxSpreadPoints) return null;

  const currentHour = getCurrentHour();
  const sessionActive = currentHour >= settings.asianSessionStartHour && currentHour < settings.asianSessionEndHour;

  const m15Data = await marketService.getChartHistory(symbol, 'M15', 200);
  const m5Data = await marketService.getChartHistory(symbol, 'M5', 200);
  const m1Data = await marketService.getChartHistory(symbol, 'M1', 100);

  if (!m15Data?.history || !m5Data?.history || !m1Data?.history) return null;

  const asianRange = calculateAsianRange(m15Data, settings.asianSessionStartHour, settings.asianSessionEndHour);
  if (!asianRange) return null;

  const sweep = detectSweep(currentPrice, asianRange);
  if (sweep === 'NONE') return null;

  const m5Candles = m5Data.history;
  const m1Candles = m1Data.history;
  const m5ATR = calculateATR(m5Candles, 14);

  if (m5ATR <= 0) return null;

  let direction = 'NO_TRADE';
  let orderBlock = null;
  let reasons = [];

  if (sweep === 'HIGH') {
    const bearishBOS = checkBearishBOS(m5Candles, m5ATR);
    const bearishOB = detectBearishOrderBlock(m5Candles, m5ATR, settings);

    if (bearishBOS && bearishOB) {
      direction = 'SELL';
      orderBlock = bearishOB;
      reasons.push('Asian HIGH swept');
      reasons.push('Bearish BOS on M5');
      reasons.push('Bearish Order Block found');
    }
  } else if (sweep === 'LOW') {
    const bullishBOS = checkBullishBOS(m5Candles, m5ATR);
    const bullishOB = detectBullishOrderBlock(m5Candles, m5ATR, settings);

    if (bullishBOS && bullishOB) {
      direction = 'BUY';
      orderBlock = bullishOB;
      reasons.push('Asian LOW swept');
      reasons.push('Bullish BOS on M5');
      reasons.push('Bullish Order Block found');
    }
  }

  if (direction === 'NO_TRADE' || !orderBlock) return null;

  const mitigation = checkMitigationOnM1(m1Candles, orderBlock, direction, settings);
  if (!mitigation.mitigated) return null;

  reasons.push('M1 mitigation confirmed');

  const entry = direction === 'BUY' ? spec.ask : spec.bid;
  const stopLoss = calculateStopLoss(direction, orderBlock, sweep === 'HIGH' ? asianRange.high : asianRange.low, settings, spec);
  const takeProfit = calculateTakeProfit(direction, asianRange, settings);

  if (direction === 'BUY' && !(stopLoss < entry && entry < takeProfit)) return null;
  if (direction === 'SELL' && !(stopLoss > entry && entry > takeProfit)) return null;

  const slDistance = Math.abs(entry - stopLoss);
  const tpDistance = Math.abs(takeProfit - entry);
  const rr = tpDistance / slDistance;

  if (rr < settings.minRr) return null;

  let score = 40;
  reasons.forEach(() => (score += 15));

  if (sessionActive) score += 10;

  const integrity = runMarketIntegrityChecks({
    symbol,
    spread: spreadPoints,
    volatility: m5ATR / currentPrice,
    priceValid: true,
    marketStatus: true,
    tradeMode: 1,
    lotSize: 0.01,
    spec,
    direction,
    entry,
    stopLoss,
    takeProfit,
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
    timeframe: 'M5',
    timestamp: Date.now(),
    metadata: {
      asianHigh: asianRange.high,
      asianLow: asianRange.low,
      asianMid: asianRange.mid,
      sweepType: sweep,
      obHigh: orderBlock.high,
      obLow: orderBlock.low,
      mitigationLevel: mitigation.level,
      m5Atr: m5ATR,
      riskReward: rr.toFixed(2),
    },
  };
}

export default { name, scan, defaultSettings, allowedSymbols };
