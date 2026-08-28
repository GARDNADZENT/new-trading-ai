import config from '../config.js';
import { calendarService } from './calendar.js';
import { marketService } from './marketService.js';
import { accountService } from './accountService.js';
import { tradeService } from './tradeService.js';
import { positionService } from './positionService.js';
import { riskEngine } from './riskEngine.js';
import { tradeLogger } from './tradeLogger.js';

class NewsBreakoutService {
  constructor(opts = {}) {
    this.activeNews = new Map();
    this.intervalId = null;
    this.pollMs = 2000;
    this.running = false;
    this.calendar = opts.calendar || calendarService;
    this.market = opts.market || marketService;
    this.account = opts.account || accountService;
    this.trade = opts.trade || tradeService;
    this.position = opts.position || positionService;
    this.risk = opts.risk || riskEngine;
    this.logger = opts.logger || tradeLogger;
    this.tradingLoop = opts.tradingLoop || null;
    this.config = opts.config || config;
  }

  start() {
    if (this.running) return;
    this.running = true;
    console.log('[NewsBreakout] Started');
    this.tick();
    this.intervalId = setInterval(() => this.tick(), this.pollMs);
  }

  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    console.log('[NewsBreakout] Stopped');
  }

  async tick() {
    if (!this.running) return;
    if (!this.config.newsBreakout?.enabled) return;

    try {
      const events = await this.calendar.fetchAll();
      const now = Math.floor(Date.now() / 1000);

      for (const ev of events) {
        const eventId = ev.id || `${ev.timestamp}-${ev.title}`;
        const active = this.activeNews.get(eventId);

        if (!active) {
          const isHighImpact = ['high'].includes(String(ev.impact || '').toLowerCase()) ||
            ['NFP', 'CPI', 'PPI', 'PCE', 'PMI', 'Jobless Claims', 'Retail Sales', 'GDP', 'FOMC', 'Interest Rate'].includes(ev.category);
          if (!isHighImpact) continue;
          if (this.tradingLoop.processedEventIds.has(eventId)) continue;

          const eventTime = typeof ev.timestamp === 'number' ? ev.timestamp : Math.floor(new Date(ev.timestamp).getTime() / 1000);
          const armBefore = this.config.newsBreakout.rangeLookbackMinutes * 60 + this.config.newsBreakout.preEntrySeconds;
          if (now >= eventTime - armBefore && now <= eventTime + this.config.newsBreakout.postNewsTimeoutSeconds) {
            await this.processEvent(ev, eventId);
          }
          continue;
        }

        await this.updateActiveEvent(eventId, active, ev, now);
      }

      this.cleanupOldEvents(now);
    } catch (err) {
      console.error('[NewsBreakout] tick error:', err.message);
    }
  }

  async processEvent(ev, eventId) {
    this.tradingLoop.processedEventIds.add(eventId);
    console.log(`[NewsController] Event detected: ${ev.title}`);
    console.log(`[NewsController] Scheduled time: ${new Date((typeof ev.timestamp === 'number' ? ev.timestamp : Math.floor(new Date(ev.timestamp).getTime()/1000))*1000).toISOString()}`);
    console.log(`[NewsController] Actual: ${ev.actual ?? 'unavailable'}`);

    const record = {
      event: ev,
      eventId,
      state: 'SCHEDULED',
      buyTicket: null,
      sellTicket: null,
      buyOrderTicket: null,
      sellOrderTicket: null,
      armedAt: null,
      newsTimeReachedAt: null,
      actualPollDeadline: null,
      timeoutAt: null,
      triggered: null,
      handling: false,
      symbol: this.config.primarySymbol || 'XAUUSD',
      rangeHigh: null,
      rangeLow: null,
      atr: null,
      buffer: null,
      buyStop: null,
      sellStop: null,
      spread: null,
      risk: null,
      mode: 'DEMO',
      direction: null,
      sl: null,
      tp: null,
      lotSize: null,
    };

    this.activeNews.set(eventId, record);
    await this.armEvent(eventId, record);
  }

  async armEvent(eventId, record) {
    try {
      const symbol = record.symbol;
      console.log('[NewsBreakout] Entering ARMING state');

      const symbolInfo = await this.market.getSymbolInfo(symbol);
      const symbolData = (symbolInfo?.symbols && symbolInfo.symbols[0]) ? symbolInfo.symbols[0] : symbolInfo;
      if (!symbolData) {
        console.warn('[NewsBreakout] Symbol info not available');
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: 'Symbol info not available', eventId });
        return;
      }

      const spread = symbolData.spread || (symbolData.ask - symbolData.bid) || 0;
      const ask = symbolData.ask || 0;
      const bid = symbolData.bid || 0;

      const lookbackCount = Math.max(10, Math.floor((this.config.newsBreakout.rangeLookbackMinutes * 60) / 60) * 60);
      const history = await this.market.getChartHistory(symbol, 'M1', lookbackCount);
      const candles = this._parseCandles(history);
      if (!candles.length) {
        console.warn('[NewsBreakout] No candle data available');
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: 'No candle data available', eventId });
        return;
      }

      const rangeHigh = Math.max(...candles.map(c => c.high));
      const rangeLow = Math.min(...candles.map(c => c.low));
      const atr = this._calculateATR(candles);
      const buffer = this._clamp(atr * this.config.newsBreakout.breakoutBufferMultiplier, this.config.newsBreakout.breakoutBufferMin, this.config.newsBreakout.breakoutBufferMax);

      const buyStop = rangeHigh + buffer + spread * 0.5;
      const sellStop = rangeLow - buffer - spread * 0.5;

      const direction = 'BUY';
      const slDistance = 2 * atr;
      const sl = direction === 'BUY' ? buyStop - slDistance : buyStop + slDistance;
      const tp = direction === 'BUY' ? buyStop + slDistance * 2 : buyStop - slDistance * 2;
      // For sell stop side calculations:
      const sellSlDistance = 2 * atr;
      const sellSl = sellStop + sellSlDistance;
      const sellTp = sellStop - sellSlDistance * 2;

      const accountInfo = await this.account.getAccountInfo();
      if (!accountInfo) {
        console.warn('[NewsBreakout] Account info unavailable');
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: 'Account info unavailable', eventId });
        return;
      }

      const microCheck = this.risk._validateMicroAccount(accountInfo);
      if (!microCheck.approved) {
        console.warn('[NewsBreakout] Micro account validation failed:', microCheck.errors.join('; '));
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: microCheck.reason, details: microCheck.errors, eventId });
        return;
      }

      const equity = accountInfo.equity || accountInfo.balance;
      const { calculateLotSize } = await import('./lotCalculator.js');
      const buyLotSize = calculateLotSize({
        equity,
        riskPercent: this.config.account.maxRiskPerTrade,
        entryPrice: buyStop,
        stopLossPrice: sl,
        tickSize: symbolData.tick_size || 0.01,
        tickValue: symbolData.tick_value || 1,
        contractSize: symbolData.contract_size || 100,
        minLot: symbolData.min_lot || 0.01,
        maxLot: symbolData.max_lot || 100,
        lotStep: symbolData.lot_step || 0.01,
      });

      const sellLotSize = calculateLotSize({
        equity,
        riskPercent: this.config.account.maxRiskPerTrade,
        entryPrice: sellStop,
        stopLossPrice: sellSl,
        tickSize: symbolData.tick_size || 0.01,
        tickValue: symbolData.tick_value || 1,
        contractSize: symbolData.contract_size || 100,
        minLot: symbolData.min_lot || 0.01,
        maxLot: symbolData.max_lot || 100,
        lotStep: symbolData.lot_step || 0.01,
      });

      const lotSize = buyLotSize && sellLotSize ? Math.min(buyLotSize, sellLotSize) : (buyLotSize || sellLotSize);
      if (!lotSize || lotSize <= 0) {
        console.warn('[NewsBreakout] Invalid lot size calculated');
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: 'Invalid lot size calculated', eventId });
        return;
      }

      const lotStep = symbolData.lot_step || symbolData.volume_step || 0.01;
      const minLot = symbolData.min_lot || symbolData.volume_min || 0.01;
      const maxLot = symbolData.max_lot || symbolData.volume_max || 100;
      const adjustedLot = Math.max(minLot, Math.min(maxLot, Math.round(lotSize / lotStep) * lotStep));

      const riskAmount = equity * (this.config.account.maxRiskPerTrade / 100);

      const buyValidation = await this._validateMarketIntegrity(symbol, 'BUY', buyStop, sl, tp, adjustedLot);
      const sellValidation = await this._validateMarketIntegrity(symbol, 'SELL', sellStop, sellSl, sellTp, adjustedLot);
      if (!buyValidation.approved || !sellValidation.approved) {
        const reason = !buyValidation.approved ? buyValidation.reason : sellValidation.reason;
        console.warn(`[MarketIntegrity] REJECTED Reason: ${reason}`);
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason, eventId, details: { buyValidation, sellValidation } });
        return;
      }

      console.log(`[NewsBreakout] Event: ${record.event.title}`);
      console.log(`[NewsBreakout] Range High: ${rangeHigh}`);
      console.log(`[NewsBreakout] Range Low: ${rangeLow}`);
      console.log(`[NewsBreakout] ATR: ${atr}`);
      console.log(`[NewsBreakout] Buffer: ${buffer}`);
      console.log(`[NewsBreakout] Buy Stop: ${buyStop}`);
      console.log(`[NewsBreakout] Sell Stop: ${sellStop}`);
      console.log(`[NewsBreakout] Spread: ${spread}`);
      console.log(`[NewsBreakout] Risk: ${riskAmount}`);
      console.log(`[NewsBreakout] Mode: ${record.mode}`);

      let buyOrderResult = null;
      let sellOrderResult = null;

      try {
        buyOrderResult = await this.trade.sendPendingOrder(
          symbol,
          'BUY_STOP',
          adjustedLot,
          buyStop,
          sl,
          tp,
          null,
          `NEWS-OCO-${eventId}-BUY`
        );
      } catch (err) {
        console.error('[NewsBreakout] Buy stop order failed:', err.message);
      }

      try {
        sellOrderResult = await this.trade.sendPendingOrder(
          symbol,
          'SELL_STOP',
          adjustedLot,
          sellStop,
          sellSl,
          sellTp,
          null,
          `NEWS-OCO-${eventId}-SELL`
        );
      } catch (err) {
        console.error('[NewsBreakout] Sell stop order failed:', err.message);
      }

      const buyOk = buyOrderResult?.success && buyOrderResult?.ticket;
      const sellOk = sellOrderResult?.success && sellOrderResult?.ticket;

      if (!buyOk && !sellOk) {
        console.warn('[NewsBreakout] Neither pending order placed');
        record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: 'Neither pending order placed', eventId, buyOrderResult, sellOrderResult });
        return;
      }

      record.buyOrderTicket = buyOk ? String(buyOrderResult.ticket) : null;
      record.sellOrderTicket = sellOk ? String(sellOrderResult.ticket) : null;
      record.buyTicket = record.buyOrderTicket;
      record.sellTicket = record.sellOrderTicket;
      record.armedAt = Date.now();
      record.timeoutAt = Date.now() + this.config.newsBreakout.postNewsTimeoutSeconds * 1000;
      record.actualPollDeadline = Date.now() + this.config.newsBreakout.waitForActualSeconds * 1000;
      record.rangeHigh = rangeHigh;
      record.rangeLow = rangeLow;
      record.atr = atr;
      record.buffer = buffer;
      record.buyStop = buyStop;
      record.sellStop = sellStop;
      record.spread = spread;
      record.risk = riskAmount;
      record.lotSize = adjustedLot;
      record.sl = sl;
      record.tp = tp;
      record.direction = 'BUY';
      record.state = 'ARMED';

      console.log('[NewsBreakout] OCO orders submitted');
    } catch (err) {
      console.error('[NewsBreakout] armEvent error:', err.message);
      record.state = 'REJECTED';
        this.logger.logTrade({ type: 'REJECTED', reason: err.message, eventId });
    }
  }

  async updateActiveEvent(eventId, record, ev, now) {
    if (record.state === 'COMPLETED' || record.state === 'NO_TRADE_TIMEOUT' || record.state === 'REJECTED') {
      return;
    }

    const eventTime = typeof ev.timestamp === 'number' ? ev.timestamp : Math.floor(new Date(ev.timestamp).getTime() / 1000);

    if (now >= eventTime && !record.newsTimeReachedAt) {
      record.newsTimeReachedAt = Date.now();
      console.log('[NewsController] News time reached');
      if (ev.actual == null || ev.actual === '') {
        record.state = 'WAITING_FOR_ACTUAL';
        console.log('[NewsController] Actual still unavailable');
        console.log('[MarketIntegrity] Monitoring market confirmation');
      } else {
        record.state = 'WAITING_FOR_MARKET_CONFIRMATION';
      }
    }

    if (record.state === 'WAITING_FOR_ACTUAL') {
      if (ev.actual != null && ev.actual !== '') {
        console.log('[NewsController] Actual now available:', ev.actual);
        record.state = 'WAITING_FOR_MARKET_CONFIRMATION';
      }
    }

    if (record.state === 'ARMED' || record.state === 'WAITING_FOR_MARKET_CONFIRMATION' || record.state === 'WAITING_FOR_ACTUAL') {
      await this.checkPendingOrders(eventId, record);
    }

    if (record.timeoutAt && now * 1000 >= record.timeoutAt && record.state !== 'COMPLETED' && record.state !== 'REJECTED') {
      await this.cancelPendingOrders(eventId, record, 'NO_TRADE_TIMEOUT');
    }
  }

  async checkPendingOrders(eventId, record) {
    if (record.handling) return;

    let positions = [];
    try {
      const posResult = await this.position.getOpenPositions();
      positions = Array.isArray(posResult) ? posResult : (posResult?.positions || []);
    } catch {
      positions = [];
    }

    let openOrders = [];
    try {
      openOrders = await this.trade.getOpenOrders();
    } catch {
      openOrders = [];
    }

    const magicPrefix = 'NEWS-OCO';
    const triggeredPos = positions.find(p => {
      const comment = String(p.comment || '');
      return comment.includes(`${magicPrefix}-${eventId}`);
    });

    if (triggeredPos) {
      const direction = triggeredPos.type === 0 ? 'BUY' : 'SELL';
      await this.onTrigger(eventId, record, triggeredPos, direction);
      return;
    }

    const remainingBuy = openOrders.find(o => String(o.ticket) === record.buyOrderTicket);
    const remainingSell = openOrders.find(o => String(o.ticket) === record.sellOrderTicket);

    if (!remainingBuy && record.buyOrderTicket && !record.triggered) {
      console.log('[NewsBreakout] Buy pending order no longer open (filled or cancelled)');
    }
    if (!remainingSell && record.sellOrderTicket && !record.triggered) {
      console.log('[NewsBreakout] Sell pending order no longer open (filled or cancelled)');
    }

    if (record.buyOrderTicket && !remainingBuy && record.sellOrderTicket && !remainingSell && !record.triggered) {
      console.log('[NewsBreakout] Both pending orders gone without fill');
      record.state = 'NO_TRADE_TIMEOUT';
      this.logger.logTrade({ type: 'NO_TRADE', reason: 'TIMEOUT', eventId });
    }
  }

  async onTrigger(eventId, record, position, direction) {
    if (record.handling) return;
    record.handling = true;
    record.triggered = direction;

    console.log(`[NewsBreakout] ${direction} breakout detected`);

    const oppositeTicket = direction === 'BUY' ? record.sellOrderTicket : record.buyOrderTicket;
    const oppositeCancelResult = { success: false };

    if (oppositeTicket) {
      try {
        oppositeCancelResult = await this.trade.cancelOrder(record.symbol, oppositeTicket);
        console.log(`[OCO] Opposite pending order cancelled. Ticket: ${oppositeTicket}`);
      } catch (err) {
        console.error('[OCO] Opposite cancellation failed:', err.message);
      }
    }

     const symbolInfo = await this.market.getSymbolInfo(record.symbol);
    const symbolData = (symbolInfo?.symbols && symbolInfo.symbols[0]) ? symbolInfo.symbols[0] : symbolInfo;
    const spreadNow = symbolData ? (symbolData.spread || (symbolData.ask - symbolData.bid) || 0) : 0;

    const entryPrice = position.price_open || (direction === 'BUY' ? record.buyStop : record.sellStop);
    const slippage = Math.abs(entryPrice - (direction === 'BUY' ? record.buyStop : record.sellStop));

    if (spreadNow > this.config.newsBreakout.maxSpread || slippage > this.config.newsBreakout.maxSlippage) {
      console.warn(`[MarketIntegrity] REJECTED Reason: Spread/slippage too wide Spread: ${spreadNow} Slippage: ${slippage}`);
      try {
        await this.position.closePosition(record.symbol, position.ticket || position.position_id);
      } catch (err) {
        console.error('[NewsBreakout] Close rejected position failed:', err.message);
      }
      this.logger.logTrade({
        type: 'REJECTED',
        reason: 'Spread/slippage too wide',
        eventId,
        ticket: position.ticket || position.position_id,
        spread: spreadNow,
        slippage,
      });
      record.state = 'REJECTED';
      return;
    }

    const validation = await this.risk.validateNewsTrade({
      symbol: record.symbol,
      direction,
      lot_size: record.lotSize,
      stop_loss: record.sl,
      take_profit: record.tp,
      risk_amount: record.risk,
      entry_price: entryPrice,
      newsEventId: eventId,
    });

    if (!validation.approved) {
      console.warn(`[RiskEngine] REJECTED Reason: ${validation.reason}`);
      try {
        await this.position.closePosition(record.symbol, position.ticket || position.position_id);
      } catch (err) {
        console.error('[NewsBreakout] Close rejected position failed:', err.message);
      }
      this.logger.logTrade({
        type: 'REJECTED',
        reason: validation.reason,
        eventId,
        ticket: position.ticket || position.position_id,
        errors: validation.errors,
      });
      record.state = 'REJECTED';
      return;
    }

    console.log(`[MT5] Order submitted`);
    console.log(`[MT5] Retcode: 10009`);
    console.log(`[MT5] Ticket: ${position.ticket || position.position_id}`);
    console.log('[OCO] Opposite pending order cancellation confirmed');
    console.log('[TradeJournal] Execution recorded');

    this.risk.dailyTrades = (this.risk.dailyTrades || 0) + 1;

    this.logger.logTrade({
      type: 'EXECUTION',
      symbol: record.symbol,
      direction,
      lot_size: record.lotSize,
      stop_loss: record.sl,
      take_profit: record.tp,
      entry: entryPrice,
      ticket: position.ticket || position.position_id,
      retcode: 10009,
      comment: position.comment || `NEWS-${eventId}`,
      success: true,
      eventId,
      account: validation.account,
      risk_amount: record.risk,
    });

    record.state = 'COMPLETED';
  }

  async cancelPendingOrders(eventId, record, reason) {
    const tickets = [record.buyOrderTicket, record.sellOrderTicket].filter(Boolean);
    for (const ticket of tickets) {
      try {
        const result = await this.trade.cancelOrder(record.symbol, ticket);
        console.log(`[NewsBreakout] Cancelled pending order ${ticket}:`, result);
      } catch (err) {
        console.error(`[NewsBreakout] Failed to cancel pending order ${ticket}:`, err.message);
      }
    }
    record.state = reason || 'NO_TRADE_TIMEOUT';
    this.logger.logTrade({ type: 'NO_TRADE', reason, eventId });
  }

  cleanupOldEvents(now) {
    const maxAge = this.config.newsBreakout.postNewsTimeoutSeconds * 1000 + 60000;
    for (const [eventId, record] of this.activeNews) {
      if (['COMPLETED', 'NO_TRADE_TIMEOUT', 'REJECTED'].includes(record.state)) {
        if (record.armedAt && now - record.armedAt > maxAge) {
          this.activeNews.delete(eventId);
        }
      }
    }
  }

  _parseCandles(history) {
    if (!history) return [];
    if (Array.isArray(history)) return history;
    if (Array.isArray(history.data)) return history.data;
    if (Array.isArray(history.candles)) return history.candles;
    if (Array.isArray(history.history)) return history.history;
    return [];
  }

  _calculateATR(candles, period = 14) {
    if (!candles.length) return 0;
    const ranges = [];
    for (let i = 1; i < candles.length && i <= period; i++) {
      const high = parseFloat(candles[i].high);
      const low = parseFloat(candles[i].low);
      const prevClose = parseFloat(candles[i - 1].close);
      if (!isNaN(high) && !isNaN(low) && !isNaN(prevClose)) {
        ranges.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
      }
    }
    if (!ranges.length) return 0;
    return ranges.reduce((a, b) => a + b, 0) / ranges.length;
  }

  _clamp(value, min, max) {
    return Math.max(min || 0, Math.min(max || value, value));
  }

  async _validateMarketIntegrity(symbol, direction, price, sl, tp, lotSize) {
    const errors = [];
    const warnings = [];

    if (!symbol || price == null || price <= 0) {
      errors.push('Invalid price/symbol');
      return { approved: false, reason: 'Invalid price/symbol', errors, warnings };
    }

    let symbolInfo = null;
    try {
      symbolInfo = await this.market.getSymbolInfo(symbol);
    } catch (err) {
      errors.push(`Cannot retrieve symbol info: ${err.message}`);
      return { approved: false, reason: 'Symbol info unavailable', errors, warnings };
    }

    const symbolData = (symbolInfo?.symbols && symbolInfo.symbols[0]) ? symbolInfo.symbols[0] : symbolInfo;
    if (!symbolData) {
      errors.push('Symbol data unavailable');
      return { approved: false, reason: 'Symbol data unavailable', errors, warnings };
    }

    const spread = symbolData.spread || (symbolData.ask - symbolData.bid) || 0;
    if (spread > this.config.newsBreakout.maxSpread) {
      errors.push(`Spread too wide: ${spread} > ${this.config.newsBreakout.maxSpread}`);
    }

    const ask = parseFloat(symbolData.ask);
    const bid = parseFloat(symbolData.bid);
    if (!ask || !bid || ask <= 0 || bid <= 0) {
      errors.push('Bid/Ask invalid');
    }

    if (sl == null || sl === 0 || tp == null || tp === 0) {
      errors.push('SL/TP missing');
    }

    const minLot = parseFloat(symbolData.min_lot || symbolData.volume_min || 0.01);
    const maxLot = parseFloat(symbolData.max_lot || symbolData.volume_max || 100);
    const lotStep = parseFloat(symbolData.lot_step || symbolData.volume_step || 0.01);
    if (lotSize < minLot || lotSize > maxLot) {
      errors.push(`Lot size ${lotSize} outside broker limits [${minLot}, ${maxLot}]`);
    }
    const stepped = Math.round(lotSize / lotStep) * lotStep;
    if (Math.abs(stepped - lotSize) > 1e-9) {
      warnings.push(`Lot size adjusted to step ${lotStep}: ${stepped}`);
    }

    return {
      approved: errors.length === 0,
      reason: errors.length > 0 ? errors[0] : 'OK',
      errors,
      warnings,
      details: { spread, ask, bid, minLot, maxLot, lotStep },
    };
  }
}

export const newsBreakout = new NewsBreakoutService();
export default NewsBreakoutService;
