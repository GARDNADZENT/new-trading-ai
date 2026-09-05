import { signalEngine } from './signalEngine.js';
import { riskEngine } from './riskEngine.js';
import { tradeService } from './tradeService.js';
import { positionService } from './positionService.js';
import { tradeLogger } from './tradeLogger.js';
import { calculateTradeLevels } from './lotCalculator.js';
import eventBus, { SIGNAL_EVENT, ERROR_EVENT } from './eventBus.js';
import config from '../config.js';
import { calendarService } from './calendar.js';
import { getLiveDataService } from './liveDataService.js';
import { marketService } from './marketService.js';
import { newsBreakout } from './newsBreakout.js';
import { HIGH_IMPACT_CATEGORIES } from '../rules/usd.js';
import { pairManager } from './pairManager.js';
import { tradePlanner } from './tradePlanner.js';
import { marketSession } from './marketSession.js';
import { opportunityManager } from './opportunityManager.js';
import dayjs from 'dayjs';

function formatTradePlanCard({ symbol, direction, entry, stopLoss, takeProfit, riskDollar, rewardDollar, riskReward, atr, spread, equity, reason, approved = true }) {
  const header = approved ? 'TRADE PLAN' : 'TRADE REJECTED';
  const summary = approved ? 'TRADE APPROVED' : 'NO TRADE';
  const riskText = riskDollar != null ? `$${Number(riskDollar).toFixed(2)}` : 'N/A';
  const rewardText = rewardDollar != null ? `$${Number(rewardDollar).toFixed(2)}` : 'N/A';
  const rrText = riskReward != null ? `${Number(riskReward).toFixed(2)} : 1` : 'N/A';
  const atrText = atr != null ? Number(atr).toFixed(4) : 'N/A';
  const spreadText = spread != null ? Number(spread).toFixed(4) : 'N/A';
  const entryText = entry != null ? Number(entry).toFixed(5) : 'N/A';
  const stopText = stopLoss != null ? Number(stopLoss).toFixed(5) : 'N/A';
  const tpText = takeProfit != null ? Number(takeProfit).toFixed(5) : 'N/A';
  const equityText = equity != null ? `$${Number(equity).toFixed(2)}` : 'N/A';

  return [
    '┌─────────────────────────────────────┐',
    `│ ${header.padEnd(31, ' ')} │`,
    '├─────────────────────────────────────┤',
    `│ ${String(symbol || 'XAUUSD').padEnd(31, ' ')} │`,
    `│ ${`${direction || 'BUY'} trade`.padEnd(31, ' ')} │`,
    '│                                     │',
    `│ Entry ${entryText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ Stop  ${stopText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ TP    ${tpText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    '│                                     │',
    `│ Risk  ${riskText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ Reward ${rewardText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ R:R   ${rrText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    '│                                     │',
    `│ ATR   ${atrText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ Spread ${spreadText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    `│ Equity ${equityText.padStart(20, ' ').slice(-20).padEnd(20, ' ')} │`,
    '│                                     │',
    `│ ${String(reason || 'No reason provided').slice(0, 31).padEnd(31, ' ')} │`,
    `│ ${summary.padEnd(31, ' ')} │`,
    '└─────────────────────────────────────┘',
  ].join('\n');
}

function formatOrderPreview({ symbol, direction, volume, entry, stopLoss, takeProfit, riskDollar, rewardDollar, riskReward, atr, spread, equity, reason }) {
  return [
    '[TradePlanner] ORDER PREVIEW',
    `Symbol: ${symbol}`,
    `Direction: ${direction}`,
    `Volume: ${volume}`,
    `Entry: ${entry}`,
    `SL: ${stopLoss}`,
    `TP: ${takeProfit}`,
    `Risk$: ${riskDollar != null ? Number(riskDollar).toFixed(2) : 'N/A'}`,
    `Reward$: ${rewardDollar != null ? Number(rewardDollar).toFixed(2) : 'N/A'}`,
    `R:R: ${riskReward != null ? Number(riskReward).toFixed(2) : 'N/A'}`,
    `ATR: ${atr != null ? Number(atr).toFixed(4) : 'N/A'}`,
    `Spread: ${spread != null ? Number(spread).toFixed(4) : 'N/A'}`,
    `Account Equity: ${equity != null ? Number(equity).toFixed(2) : 'N/A'}`,
    `Reason: ${reason || 'No reason provided'}`,
    'Validation: required checks passed before MT5 execution.',
  ].join('\n');
}

class TradingLoop {
  constructor() {
    this.running = false;
    this.intervalId = null;
    this.pollMs = 30000;
    this.processedEventIds = new Set();
    this.processedTickets = new Set();
  }

   start() {
     if (this.running) return;
     this.running = true;
     console.log('[TradingLoop] Started.');
     newsBreakout.tradingLoop = this;
     newsBreakout.start();
     this.loop();
     eventBus.on(SIGNAL_EVENT, (result) => {
       console.log('[TradingLoop] SIGNAL_EVENT received');
       this.onNewsSignal(result);
     });
   }

   stop() {
     this.running = false;
     if (this.intervalId) clearTimeout(this.intervalId);
     newsBreakout.stop();
     console.log('[TradingLoop] Stopped.');
   }


  async loop() {
    if (!this.running) return;
    try {
      if (config.tradingMode.mode === 'AUTONOMOUS' && config.tradingMode.enabled) {
        await this.runAutonomousCycle();
      } else if (config.tradingMode.mode === 'SIGNAL') {
        await this.runSignalCycle();
      }
    } catch (err) {
      console.error('[TradingLoop] Error:', err.message);
      tradeLogger.logError('trading_loop', err);
      eventBus.emit(ERROR_EVENT, { message: err.message, timestamp: Date.now() });
    }
    this.intervalId = setTimeout(() => this.loop(), this.pollMs);
  }

  async runSignalCycle() {
    const signal = await signalEngine.generateSignal();
    if (signal.action !== 'WAIT') {
      tradeLogger.logSignal(signal);
      eventBus.emit(SIGNAL_EVENT, {
        event: { title: `Signal: ${signal.symbol}`, category: 'Signal', timestamp: Date.now() },
        data: { forecast: '-', actual: signal.direction, previous: '-' },
        currencyStrength: { [signal.symbol.split('')[0] || 'X']: signal.direction },
        direction: signal.direction.toLowerCase(),
        signals: [{ pair: signal.symbol, action: signal.direction, strength: Math.round(signal.confidence / 20) || 3, category: 'Signal' }],
        confidence: signal.confidence,
        optimalHoldingTime: 0,
      });
    }
  }

   async onNewsSignal(result) {
     try {
       console.log('[TradingLoop] onNewsSignal called, confidence:', result?.confidence);
       if (!result || result.error) return;
       if (!config.tradingMode.enabled || config.tradingMode.mode !== 'AUTONOMOUS') return;
       if (config.tradingMode.paused) {
         console.log('[TradingLoop] Trading is paused, skipping news trade');
         tradeLogger.logTrade({
           type: 'NO_TRADE',
           symbol: config.primarySymbol || 'XAUUSD',
           reason: 'Trading paused',
           eventId: result.event?.id || result.event?.title,
           strategy: 'NEWS',
         });
         return;
       }

       const confidence = result.confidence || 0;
       if (confidence < 60) return;

       const category = result.event?.category || '';
       const isHighImpact = HIGH_IMPACT_CATEGORIES.includes(category);
       if (!isHighImpact) return;

       const eventId = result.event?.id || result.event?.title;
       if (!eventId || this.processedEventIds.has(eventId)) {
         console.log('[TradingLoop] Duplicate event blocked:', eventId);
         return;
       }

       this.processedEventIds.add(eventId);

        let instrumentId = config.primarySymbol || 'XAUUSD';
        const routeSignal = this._resolveRouteSignal(result);
        if (routeSignal && routeSignal.pair) {
          instrumentId = routeSignal.pair;
        }

        const resolved = await pairManager.resolveInstrument(instrumentId);
        if (!resolved) {
          console.warn(`[TradingLoop] ${instrumentId} unresolved on this broker - skipping`);
          return;
        }
        const symbol = resolved.actualSymbol;
        const symbolData = resolved.spec;
        const entry = symbolData?.ask || symbolData?.bid;
        if (!entry) {
          console.warn(`[TradingLoop] No live price for ${symbol}`);
          return;
        }

       const direction = this._newsDirectionToTrade(result, symbol, routeSignal);
       if (!direction) return;

       const atr = this._estimateATR(symbolData);
       const stopLoss = direction === 'SELL' ? entry + atr * 2 : entry - atr * 2;
       const takeProfit = direction === 'SELL' ? entry - atr * 4 : entry + atr * 4;

       const newsOpp = {
         symbol,
         strategy: 'NEWS',
         direction,
         score: Math.min(100, confidence + 20),
         entry,
         stopLoss,
         takeProfit,
         confidence,
         reason: result.event?.title || 'News signal',
         marketRegime: 'NEWS',
         timeframe: 'EVENT',
         timestamp: Date.now(),
         eventId,
       };

       opportunityManager.addNewsOpportunity(newsOpp);
       console.log(`[TradingLoop] Added news opportunity: ${direction} ${symbol} (score: ${newsOpp.score})`);
     } catch (err) {
       console.error('[TradingLoop] onNewsSignal error:', err.message);
     }
   }

  _resolveRouteSymbol(result) {
    const signals = result.signals || [];
    if (!signals.length) return null;

    const eventCategory = result.event?.category;
    // Prefer the signal that explicitly represents the event's symbol/category.
    let route = eventCategory ? signals.find(s => s.category === eventCategory) : null;

    // Otherwise route to the strongest signal emitted for the event.
    if (!route) {
      route = signals.reduce((best, s) =>
        (s.strength || 0) > (best?.strength || 0) ? s : best, signals[0]);
    }

    return route && route.pair ? route : null;
  }

  _newsDirectionToTrade(result, symbol, routeSignal) {
    // Respect the event's resolved signal first.
    if (routeSignal && routeSignal.action) {
      return String(routeSignal.action).toUpperCase();
    }

    const matched = (result.signals || []).find(s => s.pair === symbol);
    if (matched && matched.action) return String(matched.action).toUpperCase();

    // Fallback: USD strength drives XAUUSD / quote-USD pairs.
    const usdStrength = result.currencyStrength?.USD;
    if (usdStrength === 'Bullish') return 'SELL';
    if (usdStrength === 'Bearish') return 'BUY';
    return null;
  }

   _estimateATR(symbolInfo) {
    const last = symbolInfo.ask || symbolInfo.bid || 0;
    const spread = symbolInfo.spread || (symbolInfo.ask - symbolInfo.bid) || 0;
    const atr = Math.max(last * 0.005, spread * 10, 1);
    return atr;
  }

  _estimateRecentRange(symbolInfo) {
    if (!symbolInfo) return null;
    const ask = Number(symbolInfo.ask) || 0;
    const bid = Number(symbolInfo.bid) || 0;
    if (!ask || !bid) return null;
    const mid = (ask + bid) / 2;
    return {
      support: mid - 15,
      resistance: mid + 15,
    };
  }

   async runAutonomousCycle() {
     if (config.tradingMode.paused) {
       console.log('[TradingLoop] Trading is paused, skipping autonomous cycle');
       return;
     }

     console.log('[TradingLoop] Starting autonomous cycle...');
     const opportunities = await opportunityManager.scanAll();
     console.log(`[TradingLoop] Scan complete. Found ${opportunities.length} opportunities`);

     if (!opportunities || opportunities.length === 0) {
       console.log('[TradingLoop] No opportunities found');
       return;
     }

     if (!marketSession.isPairTradeableNow(opportunities[0].symbol)) {
       console.log(`[TradingLoop] ${opportunities[0].symbol} not tradeable now (weekend/closed session)`);
       return;
     }

     const status = getLiveDataService().getStatus();
     if (status.stale) {
       console.warn('[TradingLoop] Data is stale, skipping trade cycle');
       return;
     }

      let account = null;
      for (let retry = 0; retry < 3; retry++) {
        try {
          account = await accountService.getAccountInfo();
          if (account) break;
        } catch (err) {
          console.warn(`[TradingLoop] Account lookup attempt ${retry + 1} failed`);
          if (retry < 2) await new Promise(r => setTimeout(r, 1000));
        }
      }
      if (!account?.equity && !account?.balance) {
        console.warn('[TradingLoop] Account equity unavailable after retries');
        return;
      }

     // 1) Always run every SWEEP_EA opportunity first (US30 + US100 fire together).
     const sweep = opportunities.filter((o) => o.strategy === 'SWEEP_EA');
     for (const opp of sweep) {
       await this._executeOpportunity(opp, account, status);
     }

     // 2) Then the highest-scored non-sweep opportunity.
     const others = opportunities.filter((o) => o.strategy !== 'SWEEP_EA');
     if (others.length) {
       const best = others.sort((a, b) => b.score - a.score)[0];
       await this._executeOpportunity(best, account, status);
     }
   }

   async _executeOpportunity(best, account, status) {
     console.log(`[TradingLoop] Executing ${best.strategy} ${best.direction} ${best.symbol} (score: ${best.score})`);

     const resolved = await pairManager.resolveInstrument(best.symbol);
     if (!resolved) {
       console.warn(`[TradingLoop] ${best.symbol} unresolved on this broker - skipping`);
       return;
     }
     const symbol = resolved.actualSymbol;
     const symbolData = resolved.spec;
     const entry = best.entry || symbolData.ask || symbolData.bid;
     const stopLoss = best.stopLoss;
     const takeProfit = best.takeProfit;
     const direction = best.direction;

     if (!entry || !stopLoss || !takeProfit) {
       console.warn('[TradingLoop] Incomplete price levels for', best.symbol);
       return;
     }

     const tickSize = symbolData.tick_size || 0.01;
     const tickValue = symbolData.tick_value || 1;
     const contractSize = symbolData.contract_size || 100;
     const minLot = symbolData.min_lot || symbolData.volume_min || 0.01;
     const maxLot = symbolData.max_lot || symbolData.volume_max || 100;
     const lotStep = symbolData.lot_step || symbolData.volume_step || 0.01;

     const equity = account?.equity || account?.balance;

     let lotSize = best.lotSize;
     if (!lotSize) {
       lotSize = calculateLotSize({
         equity,
         riskPercent: config.risk.maxRiskPerTrade,
         entryPrice: entry,
         stopLossPrice: stopLoss,
         tickSize, tickValue, contractSize, minLot, maxLot, lotStep,
       });
     }
     if (!lotSize || lotSize <= 0) return;
     const adjustedLot = Math.max(minLot, Math.min(maxLot, lotSize));
     const finalLot = Math.round(adjustedLot / lotStep) * lotStep;

     const riskReward = best.riskReward ?? calculateRiskReward(entry, stopLoss, takeProfit, direction);
     if (riskReward != null && riskReward < config.risk.minRiskReward) {
       console.log(`[TradingLoop] R:R ${riskReward} below minimum ${config.risk.minRiskReward}`);
       tradeLogger.logTrade({
         type: 'REJECTED', symbol: best.symbol, direction, entry, stop_loss: stopLoss, take_profit: takeProfit,
         reason: `R:R ${riskReward} below minimum`, strategy: best.strategy, score: best.score,
       });
       return;
     }

     const tradePlan = calculateTradeLevels({
       direction,
       entryPrice: entry,
       atr: best.atr || 0,
       support: stopLoss,
       resistance: takeProfit,
       equity,
       riskPercent: config.risk.maxRiskPerTrade,
       minRiskReward: config.risk.minRiskReward,
       lotSize: finalLot,
       tickSize, tickValue, contractSize,
       stopLoss, takeProfit,
     });

     if (!tradePlan.approved) {
       console.warn(`[TradingLoop] REJECTED Trade plan invalid: ${tradePlan.reason}`);
       tradeLogger.logTrade({
         type: 'REJECTED', symbol: best.symbol, direction, lot_size: finalLot,
         reason: tradePlan.reason, strategy: best.strategy, score: best.score,
       });
       return;
     }

     const validation = await riskEngine.validateTrade({
       symbol: best.symbol,
       direction,
       entry,
       stop_loss: stopLoss,
       take_profit: takeProfit,
       lot_size: finalLot,
       risk_percent: config.risk.maxRiskPerTrade,
       risk_amount: tradePlan.riskDollar || 0,
       risk_reward,
       dataStale: status.stale,
     });

     if (!validation.approved) {
       console.log(`[TradingLoop] Trade rejected: ${validation.reason}`);
       tradeLogger.logTrade({
         type: 'REJECTED', symbol: best.symbol, direction, lot_size: finalLot,
         reason: validation.reason, strategy: best.strategy, score: best.score,
       });
       return;
     }

     console.log(`[TradingLoop] Executing ${direction} ${best.symbol}→${symbol} ${finalLot} lots [${best.strategy}]`);
     try {
       const result = await tradeService.sendMarketOrder(
         symbol,
         direction.toLowerCase(),
         finalLot,
         stopLoss,
         takeProfit,
         `${best.strategy}-${dayjs().format('HHmmss')}`
       );

       if (result && result.success && result.ticket) {
         this.processedTickets.add(String(result.ticket));
         console.log(`[TradingLoop] Order placed successfully. Ticket: ${result.ticket}`);
       } else {
         console.error(`[TradingLoop] Order failed:`, JSON.stringify(result));
         tradeLogger.logTrade({
           type: 'FAILED', symbol: best.symbol, direction, lot_size: finalLot,
           stop_loss: stopLoss, take_profit: takeProfit, error: result?.error, strategy: best.strategy,
         });
       }

       tradeLogger.logExecution({
         symbol: best.symbol, actualSymbol: symbol, direction, entry, stop_loss: stopLoss, take_profit: takeProfit,
         lot_size: finalLot, risk_reward, strategy: best.strategy, score: best.score,
         executionResult: result,
       });
     } catch (err) {
       console.error('[TradingLoop] Execution failed:', err.message);
       tradeLogger.logTrade({
         type: 'FAILED', symbol: best.symbol, direction, lot_size: finalLot,
         stop_loss: stopLoss, take_profit: takeProfit, error: err.message, strategy: best.strategy,
       });
       tradeLogger.logError('trade_execution', err);
     }
   }
 }

export const tradingLoop = new TradingLoop();
export default TradingLoop;
