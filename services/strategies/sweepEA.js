/**
 * SweepEA strategy (port of `ea's/SweepEA.mq5`).
 *
 * For each of US30 and US100:
 *   - At 16:30 Africa/Nairobi (= 13:30 UTC, configurable) wait for target time,
 *     then execute at the NEXT minute boundary (16:31:00) with ±5s tolerance.
 *   - Reads the just-closed M1 candle at execution time.
 *   - If the candle closed bullish -> BUY; bearish -> SELL.
 *   - SL is sized in *points* (SL_Points).
 *   - Lot size is calculated dynamically from current account equity:
 *       riskUSD = equity * riskPercent / 100
 *       lot = riskUSD / (slPoints * tickValue)
 *   - TP is sized so that monetary profit = rewardRatio * riskUSD (default 1:0.3 RR).
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
import fs from 'fs';
import path from 'path';
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
  riskPercent: 10,        // Risk this % of equity per trade
  riskUSD: 10,            // Fallback risk in USD (used when equity is unavailable)
  rewardRatio: 0.3,       // TP = rewardRatio * riskAmount  => 1:0.3 RR
  slPoints: 500,
  timeOffset: 3,          // Africa/Nairobi offset
  fixedLotFallback: 0.01,
  forceLot: undefined,    // When set, overrides calculated lot size
  magic: 202504,
  maxSpread: 50,
};

const dailyState = new Map(); // key: `${symbol}:${date}` -> true after fire
let _testNow = null;          // test-only override

const STATE_FILE = path.resolve('logs', 'sweep-state.json');

loadDailyState();

function loadDailyState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const data = JSON.parse(raw);
      for (const [key, value] of Object.entries(data)) {
        dailyState.set(key, value);
      }
    }
  } catch {
    // ignore — start fresh if state file is corrupt
  }
}

function saveDailyState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const data = Object.fromEntries(dailyState);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[SweepEA] Failed to persist daily state:', err.message);
  }
}

function markFired(key) {
  dailyState.set(key, true);
  saveDailyState();
}

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

function isMissedWindow(now, hour, minute, waitSeconds = 60) {
  const elapsedMinutes = (now.hour() - hour) * 60 + (now.minute() - minute);
  const missedAfter = Math.floor(waitSeconds / 60) + 2;
  return elapsedMinutes > missedAfter;
}

function getTickValue(symbol, pointSize) {
  const tickValueMap = {
    US100: 0.10,
    US30: 1.00,
    XAUUSD: 1.00,
    EURUSD: 1.00,
    GBPUSD: 1.00,
    USDJPY: 0.01,
  };
  return tickValueMap[symbol] || 1.0;
}

function computeLevels(side, entry, pointSize, tickValue, lot, settings, rewardUSD) {
  const slPoints = settings.slPoints;
  const slDistance = slPoints * pointSize;

  let tpPoints = 0;
  if (tickValue > 0 && lot > 0) {
    tpPoints = rewardUSD / (lot * tickValue);
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

  if (isMissedWindow(now, s.targetHour, s.targetMinute, s.waitSeconds)) {
    console.log(`[SweepEA] ${symbol} MISSED WINDOW — marking fired`);
    markFired(key);
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
    markFired(key);
    return null;
  }
  
  console.log(`[SweepEA] ${symbol} EXACTLY AT TARGET MINUTE — executing at ${now.format('HH:mm:ss')} (${secondsToNextMinute}s after ${nextMinuteTime.format('HH:mm:ss')})`);

  // 1) Verify instrument spec + live price.
  const spec = marketData.spec;
  if (!spec || spec.ask == null || spec.bid == null) return null;

  // Re-fetch fresh symbol info to bypass the 5-minute instrumentResolver cache.
  // Without this, prices can be stale (e.g. 27 points) and SL/TP calculated
  // from stale prices will be rejected by MT5 (retcode 10016 "Invalid stops")
  // because they end up on the wrong side of the current tick.
  const freshSpec = await tradeService.getSymbolInfo(marketData.actualSymbol);
  if (freshSpec && freshSpec.ask != null && freshSpec.bid != null) {
    if (freshSpec.ask !== spec.ask || freshSpec.bid !== spec.bid) {
      console.log(`[SweepEA] ${symbol} price refresh: ask ${spec.ask}→${freshSpec.ask} bid ${spec.bid}→${freshSpec.bid}`);
    }
    spec.ask = freshSpec.ask;
    spec.bid = freshSpec.bid;
    if (freshSpec.spread != null) spec.spread = freshSpec.spread;
  }

  const entry = symbol === 'US100' ? spec.ask : spec.bid; // BUY: ask, SELL: bid (decided later)

  if (spec.spread != null && s.maxSpread > 0 && spec.spread > s.maxSpread) {
    console.log(`[SweepEA] ${symbol} spread too wide: ${spec.spread} > ${s.maxSpread}`);
    return null;
  }

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

  console.log(`[SweepEA] ${symbol} spec: point=${spec.point} tick_size=${spec.tick_size} tick_value=${spec.tick_value} stops_level=${spec.stops_level} digits=${spec.digits} contract_size=${spec.contract_size}`);
  console.log(`[SweepEA] ${symbol} computed: pointSize=${pointSize} tickSize=${tickSize} tickValue=${tickValue} minDistance=${(stopsLevel + 50) * pointSize}`);

  let riskUSD = s.riskUSD;
  let rewardUSD = s.rewardUSD;

  if (s.riskPercent > 0) {
    try {
      const accountInfo = await tradeService.getAccountInfo();
      const equity = accountInfo?.equity || accountInfo?.balance || 0;
      if (equity > 0) {
        riskUSD = equity * (s.riskPercent / 100);
        rewardUSD = riskUSD * s.rewardRatio;
      }
    } catch {
      // account info unavailable — keep fallback values
    }
  }

  let lot = 0;
  if (s.forceLot != null && s.forceLot > 0) {
    lot = s.forceLot;
  } else if (tickValue > 0) {
    lot = riskUSD / (s.slPoints * tickValue);
  } else {
    lot = s.fixedLotFallback;
  }
  lot = Math.max(minLot, Math.min(lot, maxLot));
  lot = Math.round(lot / lotStep) * lotStep;
  if (lot <= 0) lot = s.fixedLotFallback;

  const marginPerLot = spec.margin_initial || 0;
  if (marginPerLot > 0) {
    let freeMargin = 0;
    try {
      const ai = await tradeService.getAccountInfo();
      freeMargin = ai?.margin_free || 0;
    } catch {}
    if (freeMargin > 0) {
      const maxAffordable = Math.floor((freeMargin / marginPerLot) / lotStep) * lotStep;
      if (maxAffordable < lot) {
        lot = Math.max(minLot, Math.min(maxAffordable, maxLot));
        lot = Math.round(lot / lotStep) * lotStep;
      }
    }
  }

  if (lot < minLot) {
    console.log(`[SweepEA] ${symbol} lot ${lot} below minimum ${minLot} after risk/margin adjustment`);
    return null;
  }

  const levels = computeLevels(side, fillPrice, pointSize, tickValue, lot, s, rewardUSD);
  let sl = levels.sl;
  let tp = levels.tp;

  // Normalize SL/TP to valid tick multiples and ensure stops_level distance.
  // Add buffer beyond stops_level because:
  // 1. MT5 may reject stops placed at exactly the minimum level (retcode 10016)
  // 2. Price can move between fresh fetch and order placement
  // 3. Tick-size rounding can eat into the margin
  // For US100: stops_level=150, point=0.01 → base minDistance=1.51
  // TP for $3 reward with 0.10 tick value and ~0.1 lot is only ~0.3 points
  // → Must enforce minimum minDistance to avoid retcode 10016
  const minDistance = (stopsLevel + 50) * pointSize;
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
    console.log(`[SweepEA] ${symbol} trade execution FAILED. Response:`, JSON.stringify(tradeResult));
    return null;
  }

  console.log(`[SweepEA] ${symbol} ${side} TRADE EXECUTED at ${fillPrice}, ticket=${tradeResult.ticket}`);

  // 5) Mark today as fired and return the opportunity.
  markFired(key);

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
    indicatorValues: { open, close, spread, riskUSD, rewardUSD, slPoints: s.slPoints, tpPoints: levels.tpPoints, lot, tickValue, pointSize, riskPercent: s.riskPercent, rewardRatio: s.rewardRatio },
  };
}

export function resetDailyState(symbol) {
  if (symbol) {
    for (const k of [...dailyState.keys()]) if (k.startsWith(`${symbol}:`)) dailyState.delete(k);
  } else {
    dailyState.clear();
  }
  saveDailyState();
  _testNow = null;
}

export const sweepEA = { name, allowedSymbols, defaultSettings, scan, resetDailyState, setNow, getNow };
export default sweepEA;
