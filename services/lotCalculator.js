export function calculateLotSize({
  equity,
  riskPercent,
  entryPrice,
  stopLossPrice,
  tickSize,
  tickValue,
  contractSize,
  minLot,
  maxLot,
  lotStep,
}) {
  if (!equity || equity <= 0) return null;
  if (!riskPercent || riskPercent <= 0) return null;
  if (entryPrice == null || stopLossPrice == null) return null;
  if (!tickSize || tickSize <= 0) return null;
  if (!tickValue || tickValue <= 0) return null;

  const riskAmount = equity * (riskPercent / 100);
  const slDistance = Math.abs(entryPrice - stopLossPrice);
  if (slDistance <= 0) return null;

  const tickCount = slDistance / tickSize;
  const riskPerLot = tickCount * tickValue;
  if (riskPerLot <= 0) return null;

  let rawLots = riskAmount / riskPerLot;

  if (lotStep && lotStep > 0) {
    rawLots = Math.floor(rawLots / lotStep) * lotStep;
  }

  if (minLot != null) {
    rawLots = Math.max(minLot, rawLots);
  }

  if (maxLot != null) {
    rawLots = Math.min(maxLot, rawLots);
  }

  rawLots = Math.max(0.01, rawLots);

  return Math.round(rawLots * 100000) / 100000;
}

export function calculateRiskReward(entry, stopLoss, takeProfit, direction) {
  if (entry == null || stopLoss == null || takeProfit == null) return null;
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);
  if (risk <= 0) return null;
  return Math.round((reward / risk) * 100) / 100;
}

export function calculateRiskAmount(equity, riskPercent, entry, stopLoss, tickSize, tickValue, contractSize) {
  if (!equity || !riskPercent || entry == null || stopLoss == null) return null;
  const riskAmount = equity * (riskPercent / 100);
  const slDistance = Math.abs(entry - stopLoss);
  const tickCount = slDistance / tickSize;
  const riskPerLot = tickCount * tickValue * (contractSize || 1);
  if (riskPerLot <= 0) return null;
  const lots = riskAmount / riskPerLot;
  return Math.round(lots * riskPerLot * 100) / 100;
}

export function calculateTradeLevels({
  direction,
  entryPrice,
  atr,
  support,
  resistance,
  equity,
  riskPercent,
  minRiskReward = 2,
  maxAtrMultiple = 3,
  lotSize = 0,
  tickSize = 0.01,
  tickValue = 1,
  contractSize = 100,
  stopLoss,
  takeProfit,
}) {
  const normalizedDirection = String(direction || '').toUpperCase();
  if (!['BUY', 'SELL'].includes(normalizedDirection)) {
    return { approved: false, reason: 'Invalid direction' };
  }

  if (entryPrice == null) {
    return { approved: false, reason: 'Entry price missing' };
  }

  const atrValue = Number.isFinite(atr) && atr > 0 ? Number(atr) : 1;
  const defaultStopLoss = normalizedDirection === 'BUY'
    ? entryPrice - atrValue * 2
    : entryPrice + atrValue * 2;
  const defaultTakeProfit = normalizedDirection === 'BUY'
    ? entryPrice + atrValue * 4
    : entryPrice - atrValue * 4;

  const resolvedStopLoss = stopLoss ?? defaultStopLoss;
  const resolvedTakeProfit = takeProfit ?? defaultTakeProfit;

  if (normalizedDirection === 'BUY') {
    if (resolvedStopLoss >= entryPrice || resolvedTakeProfit <= entryPrice) {
      return { approved: false, reason: 'BUY requires SL below entry and TP above entry' };
    }
  } else {
    if (resolvedStopLoss <= entryPrice || resolvedTakeProfit >= entryPrice) {
      return { approved: false, reason: 'SELL requires SL above entry and TP below entry' };
    }
  }

  const tradeStopLoss = resolvedStopLoss;
  const tradeTakeProfit = resolvedTakeProfit;

  const riskDistance = Math.abs(entryPrice - tradeStopLoss);
  const rewardDistance = Math.abs(tradeTakeProfit - entryPrice);
  if (riskDistance <= 0 || rewardDistance <= 0) {
    return { approved: false, reason: 'Risk or reward distance is zero or negative' };
  }

  const riskReward = rewardDistance / riskDistance;
  if (riskReward < minRiskReward) {
    return {
      approved: false,
      reason: `Risk/reward ${riskReward.toFixed(2)} below minimum ${minRiskReward}`,
      riskReward,
      riskDistance,
      rewardDistance,
    };
  }

  const maxRealisticTarget = atrValue * maxAtrMultiple;
  if (rewardDistance > maxRealisticTarget) {
    return {
      approved: false,
      reason: `TP unrealistic relative to current volatility: reward ${rewardDistance.toFixed(2)} > ${maxRealisticTarget.toFixed(2)} ATR-based limit`,
      riskReward,
      atr: atrValue,
      riskDistance,
      rewardDistance,
      maxRealisticTarget,
    };
  }

  if (normalizedDirection === 'BUY' && support != null) {
    const supportLevel = Number(support);
    if (tradeStopLoss > supportLevel && Math.abs(tradeStopLoss - supportLevel) > Math.max(atrValue * 0.5, 0.5)) {
      return { approved: false, reason: 'BUY stop is beyond the meaningful support invalidation level', support: supportLevel, stopLoss: tradeStopLoss, atr: atrValue };
    }
  }

  if (normalizedDirection === 'SELL' && resistance != null) {
    const resistanceLevel = Number(resistance);
    if (tradeStopLoss < resistanceLevel && Math.abs(tradeStopLoss - resistanceLevel) > Math.max(atrValue * 0.5, 0.5)) {
      return { approved: false, reason: 'SELL stop is beyond the meaningful resistance invalidation level', resistance: resistanceLevel, stopLoss: tradeStopLoss, atr: atrValue };
    }
  }

  if (equity > 0 && riskPercent > 0 && lotSize > 0 && tickSize > 0 && tickValue > 0 && contractSize > 0) {
    const maxRisk = equity * (riskPercent / 100);
    const riskPerLot = (riskDistance / tickSize) * tickValue * contractSize;
    const riskDollar = riskPerLot * lotSize;
    if (riskDollar > maxRisk) {
      return {
        approved: false,
        reason: `Minimum broker volume exceeds permitted account risk: risk $${riskDollar.toFixed(2)} > max $${maxRisk.toFixed(2)}`,
        riskDollar,
        maxRisk,
      };
    }
    const rewardDollar = (rewardDistance / tickSize) * tickValue * contractSize * lotSize;
    return {
      approved: true,
      reason: 'Trade plan approved',
      direction: normalizedDirection,
      entryPrice,
      stopLoss: tradeStopLoss,
      takeProfit: tradeTakeProfit,
      riskReward,
      riskDistance,
      rewardDistance,
      riskDollar,
      rewardDollar,
      atr: atrValue,
      maxRealisticTarget,
    };
  }

  return {
    approved: true,
    reason: 'Trade plan approved',
    direction: normalizedDirection,
    entryPrice,
    stopLoss: tradeStopLoss,
    takeProfit: tradeTakeProfit,
    riskReward,
    riskDistance,
    rewardDistance,
    atr: atrValue,
    maxRealisticTarget,
  };
}

export function buildTradePlan(params) {
  return calculateTradeLevels(params);
}
