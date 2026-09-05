import { pairManager } from './services/pairManager.js';
import { marketSession } from './services/marketSession.js';

console.log('=== SweepEA Debug ===\n');

console.log('Selected pairs:', pairManager.getSelectedPairs());
console.log('');

const testSymbols = ['US100', 'US30', 'US100.std', 'US30.std'];

for (const sym of testSymbols) {
  console.log(`Testing ${sym}:`);
  console.log(`  isPairTradeableNow: ${marketSession.isPairTradeableNow(sym)}`);
  
  try {
    const snapshot = await pairManager.getPairSnapshot(sym);
    console.log(`  snapshot.available: ${snapshot?.available}`);
    if (snapshot?.available) {
      console.log(`  ask: ${snapshot.ask}`);
      console.log(`  bid: ${snapshot.bid}`);
    }
  } catch (err) {
    console.log(`  snapshot error: ${err.message}`);
  }
  console.log('');
}
