import config from '../config.js';
import { marketService } from './marketService.js';
import { calculateTradeLevels, calculateLotSize, calculateRiskReward } from './lotCalculator.js';

function atrFromCandles(candles, period = 14) {
  if (!candles || candles.length < 2) return null;
  const ranges = [];
  for (let i = 1; i < candles.length && ranges.length < period; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);
    const prevClose = parseFloat(candles[i - 1].close);
    if (isNaN(high) || isNaN(low) || isNaN(prevClose)) continue;
    ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (!ranges.length) return null;
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

function structure(candles) {
  const highs = candles.map((c) => parseFloat(c.high)).filter((n) => !isNaN(n));
  const lows = candles.map((c) => parseFloat(c.low)).filter((n) => !isNaN(n));
  const closes = candles.map((c) => parseFloat(c.close)).filter((n) => !isNaN(n));
  if (!highs.length || !lows.length) return null;
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);
  const last = closes[closes.length - 1];
  return { swingHigh, swingLow, support: swingLow, resistance: swingHigh, last };
}

export async function getRecentStructure(symbol, timeframe = 'M5', count = 60) {
  const history = await marketService.getChartHistory(symbol, timeframe, count);
  const candles = (history && (history.data || history.candles || history.history || history)) || [];
  const atr = atrFromCandles(candles, 14);
  const struct = structure(candles);
  return { atr, candles, ...(struct || {}) };
}

export function planTrade({
  symbol,
  direction,
  entry,
  spec,
  atr,
  support,
  resistance,
  spread = 0,
  volatility = 1,
  equity,
  riskPercent,
  minRiskReward,
}) {
  const dir = String(direction || '').toUpperCase();
  if (!['BUY', 'SELL'].includes(dir)) {
    return { approved: false, reason: 'Invalid direction' };
  }
  if (entry == null || !spec) {
    return { approved: false, reason: 'Missing entry price or symbol specification' };
  }
  if (!atr || atr <= 0) {
    return { approved: false, reason: 'ATR unavailable for volatility-based planning' };
  }

  const params = config.pairPlanner?.[symbol] || { slAtrMult: 2, tpAtrMult: 4, maxAtrMult: 3, minRiskReward: 2 };
  const minRR = minRiskReward ?? params.minRiskReward ?? 2;
  const point = spec.point || spec.tick_size || 0.01;
  const spreadDist = (spread || 0) * point;

  const volFactor = Math.max(0.5, Math.min(3, volatility));
  const slDist = atr * params.slAtrMult * volFactor;
  const tpDist = atr * params.tpAtrMult * volFactor;

  let stopLoss;
  let takeProfit;
  if (dir === 'BUY') {
    stopLoss = entry - slDist - spreadDist;
    takeProfit = entry + tpDist;
  } else {
    stopLoss = entry + slDist + spreadDist;
    takeProfit = entry - tpDist;
  }

  if (dir === 'BUY' && !(stopLoss < entry && entry < takeProfit)) {
    return { approved: false, reason: 'Invalid BUY structure: requires SL < Entry < TP' };
  }
  if (dir === 'SELL' && !(takeProfit < entry && entry < stopLoss)) {
    return { approved: false, reason: 'Invalid SELL structure: requires TP < Entry < SL' };
  }

  const tickSize = spec.tick_size || spec.tick_size || 0.01;
  const tickValue = spec.tick_value || 1;
  const contractSize = spec.contract_size || 100;
  const minLot = spec.min_lot || 0.01;
  const maxLot = spec.max_lot || 100;
  const lotStep = spec.lot_step || 0.01;

  const riskReward = calculateRiskReward(entry, stopLoss, takeProfit, dir);
  if (riskReward == null || riskReward < minRR) {
    return { approved: false, reason: `Risk/reward ${riskReward ?? 'n/a'} below minimum ${minRR}`, riskReward, riskDistance: Math.abs(entry - stopLoss), rewardDistance: Math.abs(takeProfit - entry) };
  }

  if (equity != null && riskPercent != null) {
    const riskAmount = equity * (riskPercent / 100);
    const riskPerLot = ((Math.abs(entry - stopLoss) / tickSize) * tickValue * contractSize) || 0;
    if (riskPerLot <= 0) {
      return { approved: false, reason: 'Cannot compute risk per lot' };
    }
    const requiredLots = riskAmount / riskPerLot;

    if (requiredLots < minLot) {
      const minTradeRisk = riskPerLot * minLot;
      return {
        approved: false,
        reason: 'Minimum broker volume exceeds permitted account risk',
        blocked: true,
        minLot,
        requiredLots,
        riskPerLot,
        minTradeRisk,
        permittedRisk: riskAmount,
        riskReward,
        entry,
        stopLoss,
        takeProfit,
        atr,
      };
    }

    let lotSize = calculateLotSize({
      equity,
      riskPercent,
      entryPrice: entry,
      stopLossPrice: stopLoss,
      tickSize,
      tickValue,
      contractSize,
      minLot,
      maxLot,
      lotStep,
    });
    if (!lotSize || lotSize <= 0) {
      return { approved: false, reason: 'Lot size calculation failed' };
    }
    lotSize = Math.max(minLot, Math.min(maxLot, lotSize));

    const riskDollar = riskPerLot * lotSize;
    const rewardDollar = ((Math.abs(takeProfit - entry) / tickSize) * tickValue * contractSize) * lotSize;

    return {
      approved: true,
      reason: 'Trade plan approved',
      symbol,
      direction: dir,
      entry,
      stopLoss,
      takeProfit,
      lotSize,
      riskReward,
      riskDistance: Math.abs(entry - stopLoss),
      rewardDistance: Math.abs(takeProfit - entry),
      atr,
      spread,
      volatility,
      riskDollar,
      rewardDollar,
      minLot,
      maxLot,
      tickSize,
      tickValue,
      contractSize,
    };
  }

  return {
    approved: true,
    reason: 'Structure approved (no risk sizing)',
    symbol,
    direction: dir,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    riskDistance: Math.abs(entry - stopLoss),
    rewardDistance: Math.abs(takeProfit - entry),
    atr,
    spread,
    volatility,
  };
}

export function buildRiskReport({ symbol, spec, account, riskPercent, entry, stopLoss }) {
  const balance = account?.balance ?? account?.equity ?? 0;
  const equity = account?.equity ?? balance;
  const freeMargin = account?.margin_free ?? (equity - (account?.margin || 0));
  const permittedRisk = balance * (riskPercent / 100);

  const tickSize = spec?.tick_size || 0.01;
  const tickValue = spec?.tick_value || 1;
  const contractSize = spec?.contract_size || 100;
  const slDistance = entry != null && stopLoss != null ? Math.abs(entry - stopLoss) : 0;
  const riskPerLot = slDistance ? (slDistance / tickSize) * tickValue * contractSize : 0;
  const minLot = spec?.min_lot || 0.01;
  const minTradeRisk = riskPerLot * minLot;
  const requiredLots = riskPerLot > 0 ? permittedRisk / riskPerLot : 0;

  const blocked = requiredLots > 0 && requiredLots < minLot;

  return {
    symbol,
    balance,
    equity,
    freeMargin,
    permittedRisk,
    slDistance,
    expectedMonetaryLoss: minTradeRisk,
    permittedVolume: Math.max(0, Math.min(spec?.max_lot || 0, requiredLots)),
    minLot,
    blocked,
    reason: blocked ? 'Minimum volume exceeds permitted account risk' : 'Within risk limits',
  };
}

export const tradePlanner = { getRecentStructure, planTrade, buildRiskReport };

export default tradePlanner;
