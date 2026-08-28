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

  if (minLot != null) rawLots = Math.max(minLot, rawLots);
  if (maxLot != null) rawLots = Math.min(maxLot, rawLots);

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
