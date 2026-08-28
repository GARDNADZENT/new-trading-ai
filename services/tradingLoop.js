import { signalEngine } from './signalEngine.js';
import { riskEngine } from './riskEngine.js';
import { tradeService } from './tradeService.js';
import { positionService } from './positionService.js';
import { tradeLogger } from './tradeLogger.js';
import eventBus, { SIGNAL_EVENT, ERROR_EVENT } from './eventBus.js';
import config from '../config.js';
import { calendarService } from './calendar.js';
import { getLiveDataService } from './liveDataService.js';
import { marketService } from './marketService.js';
import { newsBreakout } from './newsBreakout.js';
import dayjs from 'dayjs';

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
        return;
      }

      const confidence = result.confidence || 0;
      if (confidence < 60) return;

      const category = result.event?.category || '';
      const impact = config.trading.impactFilter || ['high', 'medium'];
      const isHighImpact = category === 'NFP' || category === 'GDP' || category === 'CPI' || category === 'FOMC' || category === 'Interest Rate';

      if (!isHighImpact) return;

      const eventId = result.event?.id || result.event?.title;
      if (!eventId || this.processedEventIds.has(eventId)) {
        console.log('[TradingLoop] Duplicate event blocked:', eventId);
        return;
      }

      this.processedEventIds.add(eventId);

      const symbol = config.primarySymbol || 'XAUUSD';
      let symbolInfo = null;
      try {
        const marketData = await marketService.getSymbolInfo(symbol);
        symbolInfo = marketData;
        console.log('[TradingLoop] symbolInfo:', JSON.stringify(symbolInfo));
      } catch (err) {
        console.log('[TradingLoop] marketService error:', err.message);
        return;
      }

      if (!symbolInfo) return;

      const symbolData = (symbolInfo.symbols && symbolInfo.symbols[0]) ? symbolInfo.symbols[0] : symbolInfo;
      const entry = symbolData.ask || symbolData.bid;
      console.log('[TradingLoop] entry:', entry, 'ask:', symbolData.ask, 'bid:', symbolData.bid);
      if (!entry) return;

      const direction = this._newsDirectionToTrade(result);
      console.log('[TradingLoop] direction:', direction);
      if (!direction) return;

      const atr = this._estimateATR(symbolData);
      const stopLoss = direction === 'SELL' ? entry + atr * 2 : entry - atr * 2;
      const takeProfit = direction === 'SELL' ? entry - atr * 4 : entry + atr * 4;

      const tickSize = symbolData.tick_size || 0.01;
      const tickValue = symbolData.tick_value || 1;
      const contractSize = symbolData.contract_size || 100;
      const minLot = symbolData.min_lot || symbolData.volume_min || 0.01;
      const maxLot = symbolData.max_lot || symbolData.volume_max || 100;
      const lotStep = symbolData.lot_step || symbolData.volume_step || 0.01;

      const { calculateLotSize, calculateRiskReward, calculateRiskAmount } = await import('./lotCalculator.js');

      let lotSize = calculateLotSize({
        equity: 10223.85,
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
      if (riskReward != null && riskReward < config.risk.minRiskReward) return;

      const status = getLiveDataService().getStatus();
      if (status.stale) {
        console.warn('[TradingLoop] Data is stale, skipping news trade');
        return;
      }

      let account = null;
      try {
        const accountData = await accountService.getAccountInfo();
        if (accountData) {
          account = accountData;
        }
      } catch (err) {
        console.warn('[TradingLoop] Could not fetch live account info, using fallback');
      }

      const equity = account?.equity || account?.balance || 10223.85;
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

      const validation = await riskEngine.validateTrade({ ...signal, dataStale: status.stale });
      console.log('[TradingLoop] validation:', JSON.stringify(validation));
      if (!validation.approved) {
        console.log(`[TradingLoop] News trade rejected: ${validation.reason}`);
        tradeLogger.logTrade({
          type: 'REJECTED',
          symbol,
          direction,
          lot_size: lotSize,
          reason: validation.reason,
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

  _newsDirectionToTrade(result) {
    const signals = result.signals || [];
    const primarySignal = signals.find(s => s.pair === (config.primarySymbol || 'XAUUSD'));
    if (primarySignal) return primarySignal.action;

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

   async runAutonomousCycle() {
    if (config.tradingMode.paused) {
      console.log('[TradingLoop] Trading is paused, skipping autonomous cycle');
      return;
    }

    const signal = await signalEngine.generateSignal();
    if (signal.action === 'WAIT') return;

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
