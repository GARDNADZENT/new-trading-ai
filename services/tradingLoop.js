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

      // Route to the event's symbol dynamically instead of defaulting to the primary symbol.
      let symbol = config.primarySymbol || 'XAUUSD';
      const routeSignal = this._resolveRouteSignal(result);
      if (routeSignal && routeSignal.pair) {
        symbol = routeSignal.pair;
        console.log('[TradingLoop] Using dynamic symbol from event:', symbol);
      }
      let symbolInfo = null;
      try {
        const marketData = await pairManager.discoverSymbol(symbol);
        symbolInfo = marketData;
        console.log('[TradingLoop] symbolInfo:', JSON.stringify(symbolInfo));
      } catch (err) {
        console.log('[TradingLoop] marketService error:', err.message);
        return;
      }

      if (!symbolInfo) {
        console.warn(`[TradingLoop] ${symbol} specification unavailable on this MT5 account/broker`);
        return;
      }

      const symbolData = (symbolInfo.symbols && symbolInfo.symbols[0]) ? symbolInfo.symbols[0] : symbolInfo;
      const entry = symbolData.ask || symbolData.bid;
      console.log('[TradingLoop] entry:', entry, 'ask:', symbolData.ask, 'bid:', symbolData.bid);
      if (!entry) return;

      const direction = this._newsDirectionToTrade(result, symbol, routeSignal);
      console.log('[TradingLoop] direction:', direction);
      if (!direction) return;

      console.log('[TradingLoop] Executing news trade:', { symbol, direction, confidence, eventId });
      tradeLogger.logTrade({
        type: 'SIGNAL',
        symbol,
        direction,
        confidence,
        eventId,
        reason: result.event?.title || 'News signal',
      });

      const atr = this._estimateATR(symbolData);
      const recentRange = this._estimateRecentRange(symbolData);
      const support = recentRange?.support ?? entry - atr * 4;
      const resistance = recentRange?.resistance ?? entry + atr * 4;

      const tickSize = symbolData.tick_size || 0.01;
      const tickValue = symbolData.tick_value || 1;
      const contractSize = symbolData.contract_size || 100;
      const minLot = symbolData.min_lot || symbolData.volume_min || 0.01;
      const maxLot = symbolData.max_lot || symbolData.volume_max || 100;
      const lotStep = symbolData.lot_step || symbolData.volume_step || 0.01;

      let account = null;
      try {
        account = await accountService.getAccountInfo();
      } catch (err) {
        console.warn('[TradingLoop] MCP account lookup failed, trying Python bridge');
        account = await tradeService.getAccountInfo();
      }

      const equity = account?.equity || account?.balance;
      if (!equity) {
        console.warn('[TradingLoop] Account equity unavailable');
        return;
      }

      const stopLoss = direction === 'SELL' ? entry + atr * 2 : entry - atr * 2;
      const takeProfit = direction === 'SELL' ? entry - atr * 4 : entry + atr * 4;

      const { calculateLotSize, calculateRiskReward, calculateRiskAmount } = await import('./lotCalculator.js');

      let lotSize = calculateLotSize({
        equity,
        riskPercent: config.risk.maxRiskPerTrade,
        entryPrice: entry,
        stopLossPrice: stopLoss,
        tickSize,
        tickValue,
        contractSize,
        minLot,
        maxLot,
        lotStep,
      });
      console.log('[TradingLoop] lotSize:', lotSize);

      if (!lotSize || lotSize <= 0) return;
      lotSize = Math.max(minLot, Math.min(maxLot, lotSize));
      lotSize = Math.round(lotSize / lotStep) * lotStep;
      console.log('[TradingLoop] adjusted lotSize:', lotSize);

      const riskReward = calculateRiskReward(entry, stopLoss, takeProfit, direction);
      console.log('[TradingLoop] riskReward:', riskReward);

      const tradePlan = calculateTradeLevels({
        direction,
        entryPrice: entry,
        atr,
        support,
        resistance,
        equity,
        riskPercent: config.risk.maxRiskPerTrade,
        minRiskReward: config.risk.minRiskReward,
        lotSize,
        tickSize,
        tickValue,
        contractSize,
        stopLoss,
        takeProfit,
      });

      if (!tradePlan.approved) {
        console.warn(`[TradingLoop] REJECTED Trade plan invalid: ${tradePlan.reason}`);
        tradeLogger.logTrade({
          type: 'REJECTED',
          symbol,
          direction,
          entry,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          reason: tradePlan.reason,
          eventId,
          risk_reward: tradePlan.riskReward || riskReward,
          atr,
          risk_amount: lotSize * ((Math.abs(entry - stopLoss) / tickSize) * tickValue * contractSize),
        });
        return;
      }

      const status = getLiveDataService().getStatus();
      if (status.stale) {
        console.warn('[TradingLoop] Data is stale, skipping news trade');
        return;
      }

      const riskAmount = calculateRiskAmount(equity, config.risk.maxRiskPerTrade, entry, stopLoss, tickSize, tickValue, contractSize) || 0;

      const signal = {
        symbol,
        direction,
        entry,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        lot_size: lotSize,
        risk_percent: config.risk.maxRiskPerTrade,
        risk_amount: riskAmount,
        risk_reward: riskReward,
        confidence,
        fundamental_reason: result.event.title,
        technical_reason: 'News-driven trade',
        news_reason: result.event.title,
        invalidation_reason: 'Price reverses before entry',
        timestamp: Date.now(),
      };

      const preview = formatOrderPreview({
        symbol,
        direction,
        volume: lotSize,
        entry,
        stopLoss,
        takeProfit,
        riskDollar: tradePlan.riskDollar || riskAmount,
        rewardDollar: tradePlan.rewardDollar || ((Math.abs(takeProfit - entry) / tickSize) * tickValue * contractSize * lotSize),
        riskReward: tradePlan.riskReward || riskReward,
        atr,
        spread: symbolData.spread || 0,
        equity,
        reason: result.event.title,
      });
      console.log(preview);
      tradeLogger.logTradePlan({
        symbol,
        direction,
        entry,
        stopLoss,
        takeProfit,
        riskDollar: tradePlan.riskDollar || riskAmount,
        rewardDollar: tradePlan.rewardDollar || ((Math.abs(takeProfit - entry) / tickSize) * tickValue * contractSize * lotSize),
        riskReward: tradePlan.riskReward || riskReward,
        atr,
        spread: symbolData.spread || 0,
        equity,
        approved: true,
        reason: result.event.title,
        card: formatTradePlanCard({
          symbol,
          direction,
          entry,
          stopLoss,
          takeProfit,
          riskDollar: tradePlan.riskDollar || riskAmount,
          rewardDollar: tradePlan.rewardDollar || ((Math.abs(takeProfit - entry) / tickSize) * tickValue * contractSize * lotSize),
          riskReward: tradePlan.riskReward || riskReward,
          atr,
          spread: symbolData.spread || 0,
          equity,
          reason: result.event.title,
          approved: true,
        }),
      });

      const validation = await riskEngine.validateTrade({ ...signal, dataStale: status.stale });
      console.log('[TradingLoop] validation:', JSON.stringify(validation));
      if (!validation.approved) {
        console.log(`[TradingLoop] News trade rejected: ${validation.reason}`);
        const rejectionCard = formatTradePlanCard({
          symbol,
          direction,
          entry,
          stopLoss,
          takeProfit,
          riskDollar: tradePlan.riskDollar || riskAmount,
          rewardDollar: tradePlan.rewardDollar || ((Math.abs(takeProfit - entry) / tickSize) * tickValue * contractSize * lotSize),
          riskReward: tradePlan.riskReward || riskReward,
          atr,
          spread: symbolData.spread || 0,
          equity,
          reason: validation.reason,
          approved: false,
        });
        console.log(rejectionCard);
        tradeLogger.logTrade({
          type: 'REJECTED',
          symbol,
          direction,
          lot_size: lotSize,
          reason: validation.reason,
          eventId,
          card: rejectionCard,
        });
        return;
      }

      const riskReport = tradePlanner.buildRiskReport({
        symbol,
        spec: symbolData,
        account,
        riskPercent: config.risk.maxRiskPerTrade,
        entry,
        stopLoss,
      });
      if (riskReport.blocked) {
        console.warn(`[TradingLoop] 🛡 RISK PROTECTION: ${riskReport.reason}`);
        console.warn(`[TradingLoop] Minimum ${symbol} volume ${riskReport.minLot} would risk $${riskReport.expectedMonetaryLoss.toFixed(2)} > permitted $${riskReport.permittedRisk.toFixed(2)}`);
        tradeLogger.logTrade({
          type: 'REJECTED',
          symbol,
          direction,
          reason: `RISK PROTECTION: ${riskReport.reason}`,
          risk_report: riskReport,
          eventId,
        });
        return;
      }

      console.log(`[TradingLoop] News-driven trade: ${direction} ${symbol} ${lotSize} lots (${result.event.title})`);
      try {
        const tradeResult = await tradeService.sendMarketOrder(
          symbol,
          direction.toLowerCase(),
          lotSize,
          stopLoss,
          takeProfit,
          `NEWS-${dayjs().format('HHmmss')}`
        );

        if (tradeResult && tradeResult.success && tradeResult.ticket) {
          this.processedEventIds.add(eventId);
          this.processedTickets.add(String(tradeResult.ticket));
          console.log(`[TradingLoop] Order placed successfully. Ticket: ${tradeResult.ticket}`);
        } else {
          console.error(`[TradingLoop] Order failed:`, JSON.stringify(tradeResult));
          tradeLogger.logTrade({
            type: 'FAILED',
            symbol,
            direction,
            lot_size: lotSize,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            error: tradeResult?.error || 'Unknown error',
            retcode: tradeResult?.retcode,
            eventId,
          });
        }

        tradeLogger.logExecution({ ...signal, executionResult: tradeResult, account, eventId });
        console.log(`[TradingLoop] Execution result:`, JSON.stringify(tradeResult));
      } catch (err) {
        console.error('[TradingLoop] Execution failed:', err.message);
        tradeLogger.logTrade({
          type: 'FAILED',
          symbol,
          direction,
          lot_size: lotSize,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          error: err.message,
          eventId,
        });
        tradeLogger.logError('trade_execution', err);
      }
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

    const signal = await signalEngine.generateSignal();
    if (signal.action === 'WAIT') return;

    if (!marketSession.isPairTradeableNow(signal.symbol)) {
      console.log(`[TradingLoop] ${signal.symbol} not tradeable now (weekend/closed session) - skipping autonomous cycle`);
      return;
    }

    const status = getLiveDataService().getStatus();
    if (status.stale) {
      console.warn('[TradingLoop] Data is stale, skipping trade cycle');
      return;
    }

    const validation = await riskEngine.validateTrade({ ...signal, dataStale: status.stale });
    if (!validation.approved) {
      console.log(`[TradingLoop] Trade rejected: ${validation.reason}`);
      return;
    }

    if (validation.warnings.length > 0) {
      console.warn(`[TradingLoop] Trade warnings: ${validation.warnings.join('; ')}`);
    }

    console.log(`[TradingLoop] Executing ${signal.direction} ${signal.symbol} ${signal.lot_size} lots`);
    try {
      const result = await tradeService.sendMarketOrder(
        signal.symbol,
        signal.direction.toLowerCase(),
        signal.lot_size,
        signal.stop_loss,
        signal.take_profit,
        `AI-${dayjs().format('HHmmss')}`
      );

      if (result && result.success && result.ticket) {
        this.processedTickets.add(String(result.ticket));
        console.log(`[TradingLoop] Order placed successfully. Ticket: ${result.ticket}`);
      } else {
        console.error(`[TradingLoop] Order failed:`, JSON.stringify(result));
        tradeLogger.logTrade({
          type: 'FAILED',
          symbol: signal.symbol,
          direction: signal.direction,
          lot_size: signal.lot_size,
          stop_loss: signal.stop_loss,
          take_profit: signal.take_profit,
          error: result?.error || 'Unknown error',
          retcode: result?.retcode,
        });
      }

      tradeLogger.logExecution({ ...signal, executionResult: result });
      console.log(`[TradingLoop] Execution result:`, JSON.stringify(result));
    } catch (err) {
      console.error('[TradingLoop] Execution failed:', err.message);
      tradeLogger.logTrade({
        type: 'FAILED',
        symbol: signal.symbol,
        direction: signal.direction,
        lot_size: signal.lot_size,
        stop_loss: signal.stop_loss,
        take_profit: signal.take_profit,
        error: err.message,
      });
      tradeLogger.logError('trade_execution', err);
    }
  }
}

export const tradingLoop = new TradingLoop();
export default TradingLoop;
