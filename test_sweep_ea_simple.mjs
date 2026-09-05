// SweepEA Strategy Test (No external dependencies)
// Run with: node test_sweep_ea_simple.mjs

console.log('=== SweepEA Strategy Test (Simple) ===\n');

// Strategy settings
const settings = {
  targetHour: 19,
  targetMinute: 20,
  waitSeconds: 60,
  riskUSD: 10,
  rewardUSD: 3,
  slPoints: 500,
  timeOffset: 3,
};

// Test 1: Time Check
console.log('Test 1: Kenya Time Check');
const now = new Date();
const utcHours = now.getUTCHours();
const utcMinutes = now.getUTCMinutes();
const kenyaHour = (utcHours + 3) % 24;
const kenyaMinute = utcMinutes;
const isTargetTime = (kenyaHour === settings.targetHour && kenyaMinute === settings.targetMinute) ||
                     (kenyaHour === settings.targetHour && kenyaMinute === settings.targetMinute + 1 && now.getUTCSeconds() < 5);
console.log('UTC Time:', String(utcHours).padStart(2, '0'), ':', String(utcMinutes).padStart(2, '0'));
console.log('Kenya Time:', String(kenyaHour).padStart(2, '0'), ':', String(kenyaMinute).padStart(2, '0'));
console.log('Target Time:', String(settings.targetHour).padStart(2, '0'), ':', String(settings.targetMinute).padStart(2, '0'));
console.log('Is Target Time:', isTargetTime ? 'YES' : 'NO');
console.log('');

// Test 2: Symbol Validation
console.log('Test 2: Symbol Validation');
const allowedSymbols = ['US100', 'US30'];
const testSymbols = ['US100', 'US30', 'XAUUSD', 'EURUSD', 'BTCUSD'];
for (const sym of testSymbols) {
  console.log(`  ${sym}: ${allowedSymbols.includes(sym) ? 'ALLOWED' : 'REJECTED'}`);
}
console.log('');

// Test 3: Trade Calculation
console.log('Test 3: Trade Calculation');
const testCases = [
  { symbol: 'US100', point: 0.01, tickValue: 1, ask: 29061.1, bid: 29060.9, direction: 'SELL' },
  { symbol: 'US30', point: 0.01, tickValue: 1, ask: 52844.6, bid: 52844.4, direction: 'SELL' },
  { symbol: 'US100', point: 0.01, tickValue: 1, ask: 29061.1, bid: 29060.9, direction: 'BUY' },
  { symbol: 'US30', point: 0.01, tickValue: 1, ask: 52844.6, bid: 52844.4, direction: 'BUY' },
];

for (const tc of testCases) {
  console.log(`\n  ${tc.symbol} ${tc.direction}:`);
  
  const pointSize = tc.point;
  const slDistance = settings.slPoints * pointSize * 10;
  const lotSize = Math.max(0.01, Math.min(10, settings.riskUSD / (settings.slPoints * tc.tickValue)));
  const tpDistance = (settings.rewardUSD / (lotSize * tc.tickValue)) * pointSize;
  
  let entry, stopLoss, takeProfit;
  if (tc.direction === 'BUY') {
    entry = tc.ask;
    stopLoss = entry - slDistance;
    takeProfit = entry + tpDistance;
  } else {
    entry = tc.bid;
    stopLoss = entry + slDistance;
    takeProfit = entry - tpDistance;
  }
  
  const slValid = tc.direction === 'BUY' ? stopLoss < entry : stopLoss > entry;
  const tpValid = tc.direction === 'BUY' ? takeProfit > entry : takeProfit < entry;
  const rr = Math.abs(takeProfit - entry) / Math.abs(stopLoss - entry);
  
  console.log(`    Entry: ${entry.toFixed(2)}`);
  console.log(`    SL: ${stopLoss.toFixed(2)} ${slValid ? '✓' : '✗'}`);
  console.log(`    TP: ${takeProfit.toFixed(2)} ${tpValid ? '✓' : '✗'}`);
  console.log(`    Lot: ${lotSize.toFixed(2)}`);
  console.log(`    R:R = 1:${rr.toFixed(2)}`);
}

console.log('\n=== Test Complete ===');
