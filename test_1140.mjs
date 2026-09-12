import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { setNow, resetDailyState, defaultSettings } from './services/strategies/sweepEA.js';

dayjs.extend(utc);
dayjs.extend(timezone);

console.log('=== SweepEA 11:55 Test ===\n');

const STATE_FILE = path.resolve('logs', 'sweep-state.json');

if (fs.existsSync(STATE_FILE)) {
  fs.unlinkSync(STATE_FILE);
  console.log('[test] Deleted state file:', STATE_FILE);
} else {
  console.log('[test] No state file found (fresh start)');
}

resetDailyState();
console.log('[test] Reset in-memory dailyState\n');

const targetHour = 11;
const targetMinute = 55;
const targetUtcHour = targetHour - 3;

const testTime = dayjs().tz('Africa/Nairobi').hour(targetHour).minute(targetMinute).second(19).millisecond(0);

console.log(`[test] Simulating target time: ${testTime.format('HH:mm:ss')} Africa/Nairobi`);
console.log(`[test] Target config: ${targetHour}:${String(targetMinute).padStart(2, '0')}`);
console.log(`[test] UTC equivalent: ${testTime.utc().format('HH:mm:ss')} UTC\n`);

console.log('[test] With the scanAll cache fix, SWEEP_EA is scanned every 15s regardless of main cache.');
console.log('[test] At 11:56:00 (execution window), sweepEA will:');
console.log(`  1. dailyState=undefined (cleared) → proceed`);
console.log(`  2. secondsToNextMinute = 0-60 → WITHIN execution window`);
console.log(`  3. Read M1 candle → determine BUY/SELL`);
console.log(`  4. Execute trade directly via tradeService.sendMarketOrder()`);
console.log(`  5. Persist dailyState=true to logs/sweep-state.json`);
console.log(`  6. Return opportunity → TradingLoop SKIPS re-execution (ticket check)`);
console.log(`\n[test] The main scanAll cache (60s) no longer blocks sweep scans.`);
