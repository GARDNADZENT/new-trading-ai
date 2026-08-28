import { calculateLotSize, calculateRiskReward, calculateRiskAmount } from '../services/lotCalculator.js';

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

assertEqual(calculateRiskReward(4300, 4290, 4320, 'BUY'), 2, 'Risk reward 2:1');
assertEqual(calculateRiskReward(4300, 4290, 4310, 'BUY'), 1, 'Risk reward 1:1');
assertNull(calculateRiskReward(null, 4290, 4320, 'BUY'), 'Null entry returns null');

const riskAmt = calculateRiskAmount(10000, 1, 4300, 4290, 0.01, 0.01, 100);
assertEqual(riskAmt, 100, 'Risk amount equals 1% of equity');

console.log('Tests completed.');
