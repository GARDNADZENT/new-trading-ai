/**
 * SweepEA strategy (port of `ea's/SweepEA.mq5`).
 *
 * For each of US30 and US100:
 *   - At 13:40 Africa/Nairobi (= 10:40 UTC, configurable) wait for target time,
 *     then execute at the NEXT minute boundary (13:41:00) with ±5s tolerance.
 *   - Reads the just-closed M1 candle at execution time.
 *   - If the candle closed bullish -> BUY; bearish -> SELL.
 *   - SL is sized in *points* (SL_Points) so the per-trade USD risk
 *     is fixed (RiskUSD). TP is sized to deliver RewardUSD profit.
 *   - One opportunity per (symbol, calendar day) — repeating the EA's
 *     "g_tradeDone" guard.
 *
 * The strategy deliberately stays simple: it does not check news or
 * market regime. It is meant to run in parallel with the rest of the
 * portfolio (one trade per symbol per day).
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import { marketService } from '../marketService.js';
import { tradeService } from '../tradeService.js';
import config from '../../config.js';

let _chartHistoryFetcher = null; // test hook
export function setChartHistoryFetcher(fn) { _chartHistoryFetcher = fn; }
export function getChartHistoryFetcher() { return _chartHistoryFetcher; }

dayjs.extend(utc);
dayjs.extend(timezone);

export const name = 'SWEEP_EA';
export const allowedSymbols = ['US30', 'US100'];

export const defaultSettings = {
  enabled: true,
  targetHour: 16,       // Kenya time (Africa/Nairobi) — 16:30
  targetMinute: 30,
  waitSeconds: 60,        // Wait 60s for M1 candle to close after target
  riskUSD: 10,
  rewardUSD: 3,
  slPoints: 500,
  timeOffset: 3,          // Africa/Nairobi offset
  fixedLotFallback: 0.01,
  magic: 202504,
  maxSpread: 50,
};

const dailyState = new Map(); // key: `${symbol}:${date}` -> true after fire
let _testNow = null;          // test-only override

export function setNow(date) { _testNow = date; }
export function getNow() { return _testNow || new Date(); }

function stateKey(symbol, tz) {
  return `${symbol}:${dayjs(getNow()).tz(tz).format('YYYY-MM-DD')}`;
}

function nairobiNow() {
  return dayjs(getNow()).tz('Africa/Nairobi');
}

function isAtOrPastTarget(now, hour, minute) {
  return now.hour() > hour || (now.hour() === hour && now.minute() >= minute);
}

function isMissedWindow(now, hour, minute) {
  return now.hour() > hour || (now.hour() === hour && now.minute() > minute + 120);
}

function computeLevels(side, entry, pointSize, tickValue, lot, settings) {
  const slPoints = settings.slPoints;
  const slDistance = slPoints * pointSize;

  // TP is sized to deliver RewardUSD profit ($3)
  let tpPoints = 0;
  if (tickValue > 0 && lot > 0) {
    tpPoints = settings.rewardUSD / (lot * tickValue);
  } else {
    tpPoints = slPoints * 0.5;
  }
  if (tpPoints < 1) tpPoints = 1;
  const tpDistance = tpPoints * pointSize;

  let sl, tp;
  if (side === 'BUY') {
    sl = entry - slDistance;
    tp = entry + tpDistance;
  } else {
    sl = entry + slDistance;
    tp = entry - tpDistance;
  }
  return { sl, tp, slDistance, tpDistance, tpPoints, slPoints };
}

export async function scan(symbol, marketData) {
  const s = { ...defaultSettings, ...(config.strategies?.sweepEA || {}) };
  if (!s.enabled) { console.log(`[SweepEA] ${symbol} strategy disabled`); return null; }
  if (!allowedSymbols.includes(symbol)) { console.log(`[SweepEA] ${symbol} not in allowedSymbols`); return null; }
  if (!marketData?.available) { console.log(`[SweepEA] ${symbol} marketData not available`); return null; }

  const now = nairobiNow();
  const key = stateKey(symbol, 'Africa/Nairobi');
  console.log(`[SweepEA] DEBUG ${symbol} now=${now.format('HH:mm:ss')} target=${s.targetHour}:${String(s.targetMinute).padStart(2,'0')} key=${key} dailyState=${dailyState.get(key)}`);
  if (dailyState.get(key)) { console.log(`[SweepEA] ${symbol} already fired today`); return null; }

  if (isMissedWindow(now, s.targetHour, s.targetMinute)) {
    console.log(`[SweepEA] ${symbol} MISSED WINDOW — marking fired`);
    dailyState.set(key, true);
    return null;
  }
  if (!isAtOrPastTarget(now, s.targetHour, s.targetMinute)) {
    console.log(`[SweepEA] ${symbol} before target time ${now.format('HH:mm')}`);
    return null;
  }

  const targetToday = now.hour(s.targetHour).minute(s.targetMinute).second(0).millisecond(0);
  
  // Calculate when the next minute starts after the target
  const nextMinuteTime = targetToday.add(1, 'minute');
  const secondsToNextMinute = now.diff(nextMinuteTime, 'second');
  
  // Execute within the target minute (16:02:00 - 16:02:59), allowing 60 seconds tolerance for trading loop interval
  if (secondsToNextMinute < 0) {
    console.log(`[SweepEA] ${symbol} waiting for next minute — ${now.format('HH:mm:ss')} < ${nextMinuteTime.format('HH:mm:ss')} (${Math.abs(secondsToNextMinute)}s before)`);
    return null;
  }
  if (secondsToNextMinute > 60) {
    console.log(`[SweepEA] ${symbol} missed target minute — ${secondsToNextMinute}s after ${nextMinuteTime.format('HH:mm:ss')}`);
    dailyState.set(key, true);
    return null;
  }
  
  console.log(`[SweepEA] ${symbol} EXACTLY AT TARGET MINUTE — executing at ${now.format('HH:mm:ss')} (${secondsToNextMinute}s after ${nextMinuteTime.format('HH:mm:ss')})`);

  // 1) Verify instrument spec + live price.
  const spec = marketData.spec;
  if (!spec || spec.ask == null || spec.bid == null) return null;
  const entry = symbol === 'US100' ? spec.ask : spec.bid; // BUY: ask, SELL: bid (decided later)

  // 2) Pull M1 candles and read the just-closed bar.
  const history = await marketService.getChartHistory(marketData.actualSymbol, 'M1', 5);
  if (!history) return null;
  const candles = history.data || history.history || history.candles || history;
  if (!Array.isArray(candles) || candles.length < 2) return null;
  // MT5 copy typically returns oldest-first; the most recent closed is candles[len-2]
  // (candles[len-1] is the still-open bar).
  const closed = candles[candles.length - 2] || candles[candles.length - 1];
  const open = parseFloat(closed.open);
  const close = parseFloat(closed.close);
  if (!isFinite(open) || !isFinite(close)) return null;

  const bullish = close > open;
  const side = bullish ? 'BUY' : 'SELL';
  const fillPrice = side === 'BUY' ? spec.ask : spec.bid;
  const spread = spec.ask - spec.bid;

  // 3) Size the lot and compute SL/TP
  const tickSize = spec.tick_size || spec.point || 0.01;
  const tickValue = spec.tick_value || getTickValue(symbol);
  const minLot = spec.min_lot || 0.01;
  const maxLot = spec.max_lot || 100;
  const lotStep = spec.lot_step || 0.01;
  const pointSize = spec.point || tickSize;
  const stopsLevel = spec.stops_level || 10;
  const digits = spec.digits || 2;

  let lot = 0;
  if (tickValue > 0) {
    lot = s.riskUSD / (s.slPoints * tickValue);
  } else {
    lot = s.fixedLotFallback;
  }
  lot = Math.max(minLot, Math.min(lot, maxLot));
  lot = Math.round(lot / lotStep) * lotStep;
  if (lot <= 0) lot = s.fixedLotFallback;

  const levels = computeLevels(side, fillPrice, pointSize, tickValue, lot, s);
  let sl = levels.sl;
  let tp = levels.tp;

  // Normalize SL/TP to valid tick multiples and ensure stops_level distance
  const minDistance = stopsLevel * pointSize;
  if (side === 'BUY') {
    sl = Math.round(sl / tickSize) * tickSize;
    tp = Math.round(tp / tickSize) * tickSize;
    // Ensure SL is at least stops_level away
    if (fillPrice - sl < minDistance) {
      sl = fillPrice - minDistance;
    }
    // Ensure TP is at least stops_level away
    if (tp - fillPrice < minDistance) {
      tp = fillPrice + minDistance;
    }
  } else {
    sl = Math.round(sl / tickSize) * tickSize;
    tp = Math.round(tp / tickSize) * tickSize;
    if (sl - fillPrice < minDistance) {
      sl = fillPrice + minDistance;
    }
    if (fillPrice - tp < minDistance) {
      tp = fillPrice - minDistance;
    }
  }

  // Round to correct digits
  sl = parseFloat(sl.toFixed(digits));
  tp = parseFloat(tp.toFixed(digits));

  if (sl === fillPrice || tp === fillPrice) {
    console.log(`[SweepEA] ${symbol} SL/TP too close to entry`);
    return null;
  }

  console.log(`[SweepEA] ${symbol} ${side} Entry=${fillPrice} SL=${sl} TP=${tp} Lot=${lot} stopsLevel=${stopsLevel}`);

  // 4) Execute trade directly
  const tradeResult = await tradeService.sendMarketOrder(
    marketData.actualSymbol,
    side,
    lot,
    sl,
    tp,
    `SweepEA-${side}`
  );

  if (!tradeResult || !tradeResult.success) {
    console.log(`[SweepEA] ${symbol} trade execution failed`);
    return null;
  }

  console.log(`[SweepEA] ${symbol} ${side} TRADE EXECUTED at ${fillPrice}, ticket=${tradeResult.ticket}`);

  // 5) Mark today as fired and return the opportunity.
  dailyState.set(key, true);

  const riskDistance = Math.abs(fillPrice - sl);
  const rewardDistance = Math.abs(tp - fillPrice);
  const riskReward = riskDistance > 0 ? rewardDistance / riskDistance : 0;

  return {
    symbol,
    strategy: name,
    direction: side,
    score: 70,
    entry: fillPrice,
    stopLoss: sl,
    takeProfit: tp,
    lotSize: lot,
    riskReward,
    reason: `SweepEA daily ${s.targetHour}:${String(s.targetMinute).padStart(2, '0')} Nairobi — candle ${bullish ? 'bullish' : 'bearish'}`,
    timeframe: 'M1',
    ticket: tradeResult.ticket,
    indicatorValues: { open, close, spread, riskUSD: s.riskUSD, rewardUSD: s.rewardUSD, slPoints: s.slPoints, tpPoints: levels.tpPoints, lot, tickValue, pointSize },
  };
}

export function resetDailyState(symbol) {
  if (symbol) {
    for (const k of [...dailyState.keys()]) if (k.startsWith(`${symbol}:`)) dailyState.delete(k);
  } else {
    dailyState.clear();
  }
  _testNow = null;
}

export const sweepEA = { name, allowedSymbols, defaultSettings, scan, resetDailyState, setNow, getNow };
export default sweepEA;
