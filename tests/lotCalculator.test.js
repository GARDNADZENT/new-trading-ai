import { calculateLotSize, calculateRiskReward, calculateRiskAmount, buildTradePlan, calculateTradeLevels } from '../services/lotCalculator.js';
import { getSignal } from '../rules/usd.js';
import { generateSignals } from '../services/analyzer.js';

function assertEqual(actual, expected, label) {
  const pass = Math.abs((actual || 0) - (expected || 0)) < 0.0001;
  if (!pass) {
    console.error(`FAIL: ${label} | expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

function assertNull(actual, label) {
  if (actual !== null && actual !== undefined) {
    console.error(`FAIL: ${label} | expected null, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

function assertSame(actual, expected, label) {
  if (actual !== expected) {
    console.error(`FAIL: ${label} | expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

console.log('Running lotCalculator tests...');

assertEqual(calculateLotSize({
  equity: 10000, riskPercent: 1, entryPrice: 4300, stopLossPrice: 4290,
  tickSize: 0.01, tickValue: 1, contractSize: 100,
  minLot: 0.01, maxLot: 100, lotStep: 0.01,
}), 0.1, 'Basic lot calculation');

assertNull(calculateLotSize({
  equity: 0, riskPercent: 1, entryPrice: 4300, stopLossPrice: 4290,
  tickSize: 0.01, tickValue: 0.01, contractSize: 100,
  minLot: 0.01, maxLot: 100, lotStep: 0.01,
}), 'Zero equity returns null');

assertEqual(calculateLotSize({
  equity: 10, riskPercent: 1, entryPrice: 4300, stopLossPrice: 4290,
  tickSize: 0.01, tickValue: 1, contractSize: 100,
  minLot: 0.01, maxLot: 100, lotStep: 0.01,
}), 0.01, 'Minimum broker volume is used when risk-based size is too small');

assertEqual(calculateLotSize({
  equity: 10000, riskPercent: 1, entryPrice: 4483.02, stopLossPrice: 4163.02,
  tickSize: 0.01, tickValue: 1, contractSize: 100,
  minLot: 0.01, maxLot: 100, lotStep: 0.01,
}), 0.01, 'Falls back to broker minimum lot when risk-based size is too small');

assertEqual(calculateRiskReward(4300, 4290, 4320, 'BUY'), 2, 'Risk reward 2:1');
assertEqual(calculateRiskReward(4300, 4290, 4310, 'BUY'), 1, 'Risk reward 1:1');
assertNull(calculateRiskReward(null, 4290, 4320, 'BUY'), 'Null entry returns null');

const unrealistic = buildTradePlan({
  direction: 'BUY',
  entryPrice: 4481,
  stopLoss: 4161,
  takeProfit: 5121,
  atr: 160,
  support: 4400,
  resistance: 4520,
  equity: 10478.41,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
});
assertEqual(unrealistic.approved, false, 'Unrealistic TP is rejected');

const reversed = buildTradePlan({
  direction: 'BUY',
  entryPrice: 4481,
  stopLoss: 4520,
  takeProfit: 4450,
  atr: 20,
  support: 4400,
  resistance: 4520,
  equity: 10478.41,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
});
assertEqual(reversed.approved, false, 'BUY SL/TP direction reversal is rejected');

const rewardTooLow = buildTradePlan({
  direction: 'BUY',
  entryPrice: 4481,
  stopLoss: 4471,
  takeProfit: 4478,
  atr: 20,
  support: 4400,
  resistance: 4520,
  equity: 10478.41,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
});
assertEqual(rewardTooLow.approved, false, 'Risk/reward below configured minimum is rejected');

const riskAmt = calculateRiskAmount(10000, 1, 4300, 4290, 0.01, 0.01, 100);
assertEqual(riskAmt, 100, 'Risk amount equals 1% of equity');

const derivedPlan = calculateTradeLevels({
  direction: 'BUY',
  entryPrice: 3500,
  stopLoss: 3490,
  takeProfit: 3520,
  atr: 20,
  support: 3480,
  resistance: 3540,
  equity: 100000,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
});
assertEqual(derivedPlan.approved, true, 'Derived BUY plan passes volatility and risk validation');
assertEqual(derivedPlan.stopLoss < derivedPlan.entryPrice, true, 'Derived BUY stop is below entry');
assertEqual(derivedPlan.takeProfit > derivedPlan.entryPrice, true, 'Derived BUY take profit is above entry');
assertEqual(derivedPlan.riskReward >= 2, true, 'Derived BUY plan meets the minimum R:R');

const absurdPlan = calculateTradeLevels({
  direction: 'BUY',
  entryPrice: 4481,
  atr: 160,
  support: 4400,
  resistance: 4520,
  equity: 10478.41,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: 0.01,
  tickSize: 0.01,
  tickValue: 1,
  contractSize: 100,
});
assertEqual(absurdPlan.approved, false, 'Absurd XAUUSD TP is rejected');
assertEqual(absurdPlan.reason.includes('TP unrealistic') || absurdPlan.reason.includes('Risk/reward'), true, 'Absurd plan is rejected for unrealistic target or risk/reward');

const btcBuySignal = getSignal('BTCUSD', 'above', 'BTCUSD', {});
assertSame(btcBuySignal?.action, 'BUY', 'BTCUSD breakout above is treated as a BUY');

// ===== INTEGRATION TEST: Bitcoin Breakout Event Flow =====
console.log('\n--- Integration: Bitcoin Breakout Event ---');

const mockBtcEvent = {
  title: 'Bitcoin Breakout Event',
  currency: 'USD',
  category: 'BTCUSD',
  timestamp: Math.floor(Date.now() / 1000),
  forecast: '45000',  // Previous resistance
  previous: '44800',
  actual: '46100',    // Breakout above forecast
};

const signalResult = generateSignals(mockBtcEvent);
console.log(`[Integration] Signal confidence: ${signalResult.confidence}%`);
console.log(`[Integration] Signal direction: ${signalResult.direction}`);

const btcSignal = signalResult.signals?.find(s => s.pair === 'BTCUSD');
assertSame(btcSignal?.action, 'BUY', 'BTCUSD mock event produces BUY signal');
assertSame(signalResult.direction, 'above', 'Bitcoin event direction is above');

// Simulate realistic BTCUSD market conditions and trade plan
const btcEntry = 42800;  // Typical BTC price level
const btcAtr = 100;      // Bitcoin ATR (realistic for validation)
const btcEquity = 100000; // Realistic account equity
const btcTickSize = 0.01;
const btcTickValue = 1;
const btcContractSize = 1;

const btcLotSize = calculateLotSize({
  equity: btcEquity,
  riskPercent: 1,
  entryPrice: btcEntry,
  stopLossPrice: btcEntry - btcAtr * 1.5,
  tickSize: btcTickSize,
  tickValue: btcTickValue,
  contractSize: btcContractSize,
  minLot: 0.001,
  maxLot: 10,
  lotStep: 0.001,
});

const btcTradePlan = calculateTradeLevels({
  direction: 'BUY',
  entryPrice: btcEntry,
  stopLoss: btcEntry - btcAtr * 1,     // SL 1 ATR below entry
  takeProfit: btcEntry + btcAtr * 2.5, // TP 2.5 ATR above entry
  atr: btcAtr,
  support: btcEntry - btcAtr * 1.2,    // Support very close to entry
  resistance: btcEntry + btcAtr * 4,
  equity: btcEquity,
  riskPercent: 1,
  minRiskReward: 2,
  lotSize: btcLotSize,
  tickSize: btcTickSize,
  tickValue: btcTickValue,
  contractSize: btcContractSize,
});

if (!btcTradePlan.approved) {
  console.log(`[Integration] Trade plan rejection reason: ${btcTradePlan.reason}`);
}
assertSame(btcTradePlan.approved, true, 'BTCUSD breakout buy plan is approved');

// Format the order preview
const orderPreview = {
  symbol: 'BTCUSD',
  action: 'BUY',
  entry: btcTradePlan.entryPrice,
  stopLoss: btcTradePlan.stopLoss,
  takeProfit: btcTradePlan.takeProfit,
  lot: btcTradePlan.lotSize,
  riskReward: btcTradePlan.riskReward,
  confidence: signalResult.confidence,
};

console.log(`[Integration] Order Preview:`);
console.log(`  Symbol: ${orderPreview.symbol}`);
console.log(`  Action: ${orderPreview.action}`);
console.log(`  Entry: $${orderPreview.entry}`);
console.log(`  SL: $${orderPreview.stopLoss}`);
console.log(`  TP: $${orderPreview.takeProfit}`);
console.log(`  Lot: ${orderPreview.lot}`);
console.log(`  R:R: ${orderPreview.riskReward}:1`);
console.log(`  Confidence: ${orderPreview.confidence}%`);

console.log('Tests completed.');
