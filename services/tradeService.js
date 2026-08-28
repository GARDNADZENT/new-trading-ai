import mt5MCP from './mt5MCP.js';

class TradeService {
  async sendMarketOrder(symbol, type, volume, sl = null, tp = null, comment = '') {
    try {
      const typeMap = { BUY: 0, SELL: 1, BUYLIMIT: 2, SELLLIMIT: 3, BUYSTOP: 4, SELLSTOP: 5 };
      const mt5Type = typeof type === 'number' ? type : (typeMap[type.toUpperCase()] ?? 0);

      const params = {
        symbol,
        type: mt5Type,
        volume,
        sl: sl || 0,
        tp: tp || 0,
        magic: 123456,
        comment: comment || 'TradePulse',
      };

      const result = await mt5MCP.callTool('trade_send_market_order', params);
      return this._normalizeResult(result);
    } catch (err) {
      console.error('[TradeService] MCP market order failed:', err.message);
      throw err;
    }
  }

  async sendPendingOrder(symbol, type, volume, price, sl = null, tp = null, stoplimit = null, comment = '') {
    try {
      const typeMap = { BUY_STOP: 3, SELL_STOP: 4, BUY_LIMIT: 5, SELL_LIMIT: 6 };
      const mt5Type = typeof type === 'number' ? type : (typeMap[type.toUpperCase()] ?? 3);

      const params = {
        symbol,
        type: mt5Type,
        volume,
        price,
        sl: sl || 0,
        tp: tp || 0,
        magic: 123456,
        comment: comment || 'TradePulse',
      };

      const result = await mt5MCP.callTool('trade_send_pending_order', params);
      return this._normalizeResult(result);
    } catch (err) {
      console.error('[TradeService] MCP pending order failed:', err.message);
      throw err;
    }
  }

  async cancelOrder(symbol, orderTicket) {
    try {
      const params = {
        symbol,
        order_ticket: orderTicket,
      };
      const result = await mt5MCP.callTool('trade_delete_order', params);
      return this._normalizeResult(result);
    } catch (err) {
      console.error('[TradeService] MCP cancel order failed:', err.message);
      throw err;
    }
  }

  async getOpenOrders(symbol = null) {
    try {
      const positions = await positionService.getOpenPositions(symbol);
      const orders = [];
      for (const p of positions) {
        if (p.type === 2 || p.type === 3 || p.type === 4 || p.type === 5) {
          orders.push({
            ticket: p.ticket,
            symbol: p.symbol,
            type: p.type,
            volume: p.volume,
            price: p.price_open,
            sl: p.sl,
            tp: p.tp,
          });
        }
      }
      return orders;
    } catch (err) {
      console.error('[TradeService] Failed to get open orders:', err.message);
      return [];
    }
  }

  async getPositions() {
    try {
      return await positionService.getOpenPositions();
    } catch (err) {
      console.error('[TradeService] Failed to get positions:', err.message);
      return [];
    }
  }

  async getAccountInfo() {
    try {
      return await accountService.getAccountInfo();
    } catch (err) {
      console.error('[TradeService] Failed to get account info:', err.message);
      return null;
    }
  }

  _normalizeResult(result) {
    if (!result) {
      return { success: false, retcode: null, comment: 'No result from MT5 MCP' };
    }
    if (result.isError) {
      const text = result.content?.[0]?.text || 'Unknown error';
      return { success: false, retcode: null, comment: text };
    }
    const text = result.content?.[0]?.text || '';
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
    return {
      success: true,
      ticket: parsed.ticket || parsed.order || parsed.result || null,
      retcode: parsed.retcode || parsed.result || 10009,
      comment: parsed.comment || parsed.description || 'Request executed',
      raw: parsed,
    };
  }
}

import { accountService } from './accountService.js';
import { positionService } from './positionService.js';

export const tradeService = new TradeService();
export default TradeService;
