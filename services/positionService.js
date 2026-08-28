import mt5MCP from './mt5MCP.js';

class PositionService {
  async getOpenPositions(symbol = null) {
    try {
      const params = {};
      if (symbol) params.symbol = symbol;
      const result = await mt5MCP.callTool('get_trading_open_positions', params);
      if (result?.content?.[0]?.type === 'text') {
        const text = result.content[0].text;
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }
      return result;
    } catch (err) {
      console.error('[PositionService] getOpenPositions failed:', err.message);
      throw err;
    }
  }

  async getHistoryPositions(symbol = null, from = null, to = null) {
    try {
      const params = {};
      if (symbol) params.symbol = symbol;
      if (from) params.datetime_from = from;
      if (to) params.datetime_to = to;
      const result = await mt5MCP.callTool('get_trading_history_positions', params);
      if (result?.content?.[0]?.type === 'text') {
        const text = result.content[0].text;
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }
      return result;
    } catch (err) {
      console.error('[PositionService] getHistoryPositions failed:', err.message);
      throw err;
    }
  }

  async getHistoryOrders(symbol = null, from = null, to = null) {
    try {
      const params = {};
      if (symbol) params.symbol = symbol;
      if (from) params.datetime_from = from;
      if (to) params.datetime_to = to;
      const result = await mt5MCP.callTool('get_trading_history_orders', params);
      if (result?.content?.[0]?.type === 'text') {
        const text = result.content[0].text;
        try {
          return JSON.parse(text);
        } catch {
          return { raw: text };
        }
      }
      return result;
    } catch (err) {
      console.error('[PositionService] getHistoryOrders failed:', err.message);
      throw err;
    }
  }

  async closePosition(symbol, positionTicket) {
    try {
      const result = await mt5MCP.callTool('trade_close_single_position', {
        symbol,
        position_ticket: positionTicket,
      });
      return result;
    } catch (err) {
      console.error('[PositionService] closePosition failed:', err.message);
      throw err;
    }
  }

  async modifyPosition(symbol, positionTicket, sl = null, tp = null) {
    try {
      const params = { symbol };
      if (sl !== null) params.sl = sl;
      if (tp !== null) params.tp = tp;
      if (positionTicket !== null) params.position_ticket = positionTicket;
      const result = await mt5MCP.callTool('trade_modify_sl_tp', params);
      return result;
    } catch (err) {
      console.error('[PositionService] modifyPosition failed:', err.message);
      throw err;
    }
  }

  async deleteOrder(symbol, orderTicket) {
    try {
      const result = await mt5MCP.callTool('trade_delete_order', {
        symbol,
        order_ticket: orderTicket,
      });
      return result;
    } catch (err) {
      console.error('[PositionService] deleteOrder failed:', err.message);
      throw err;
    }
  }
}

export const positionService = new PositionService();
export default PositionService;
