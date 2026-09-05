import axios from 'axios';
import config from '../config.js';

const PYTHON_SERVER_URL = config.mt5Python?.url || process.env.MT5_PYTHON_SERVER_URL || 'http://127.0.0.1:8000';

class TradeService {
  async healthCheck() {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await axios.get(`${PYTHON_SERVER_URL}/health`, { timeout: 30000 });
        return response.data;
      } catch (err) {
        console.error(`[TradeService] Health check failed (attempt ${attempt}/3):`, err.message);
        if (attempt === 3) return null;
      }
    }
    return null;
  }

  async sendMarketOrder(symbol, type, volume, sl = null, tp = null, comment = '') {
    try {
      const payload = {
        symbol,
        action: type.toUpperCase(),
        volume,
        sl: sl || 0,
        tp: tp || 0,
        magic: 123456,
        comment: comment || 'TradePulse',
      };

      const response = await axios.post(`${PYTHON_SERVER_URL}/trade`, payload, {
        timeout: 15000,
      });

      return response.data;
    } catch (err) {
      console.error('[TradeService] Python server trade failed:', err.message);
      if (err.response) {
        console.error('[TradeService] Response:', err.response.data);
      }
      throw err;
    }
  }

  async sendPendingOrder(symbol, type, volume, price, sl = null, tp = null, stoplimit = null, comment = '') {
    try {
      const payload = {
        symbol,
        type,
        volume,
        price,
        sl: sl || 0,
        tp: tp || 0,
        magic: 123456,
        comment: comment || 'TradePulse',
      };

      const response = await axios.post(`${PYTHON_SERVER_URL}/pending-order`, payload, {
        timeout: 15000,
      });

      return response.data;
    } catch (err) {
      console.error('[TradeService] Python server pending order failed:', err.message);
      if (err.response) {
        console.error('[TradeService] Response:', err.response.data);
      }
      throw err;
    }
  }

  async cancelOrder(symbol, orderTicket) {
    try {
      const payload = {
        symbol,
        order_ticket: orderTicket,
      };
      const response = await axios.post(`${PYTHON_SERVER_URL}/cancel-order`, payload, {
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      console.error('[TradeService] Python server cancel order failed:', err.message);
      if (err.response) {
        console.error('[TradeService] Response:', err.response.data);
      }
      throw err;
    }
  }

  async modifyPosition(symbol, positionTicket, sl = null, tp = null) {
    try {
      const payload = {
        symbol,
        position_ticket: positionTicket,
      };
      if (sl !== null && sl !== 0) payload.sl = sl;
      if (tp !== null && tp !== 0) payload.tp = tp;
      const response = await axios.post(`${PYTHON_SERVER_URL}/modify-position`, payload, {
        timeout: 15000,
      });
      return response.data;
    } catch (err) {
      console.error('[TradeService] Python server modify position failed:', err.message);
      if (err.response) {
        console.error('[TradeService] Response:', err.response.data);
      }
      throw err;
    }
  }

  async getOpenOrders(symbol = null) {
    try {
      const url = symbol ? `${PYTHON_SERVER_URL}/orders?symbol=${encodeURIComponent(symbol)}` : `${PYTHON_SERVER_URL}/orders`;
      const response = await axios.get(url, { timeout: 30000 });
      const orders = response.data?.orders || [];
      if (symbol) {
        return orders.filter(o => (o.symbol || '') === symbol);
      }
      return orders;
    } catch (err) {
      console.error('[TradeService] Failed to get open orders:', err.message);
      return [];
    }
  }

  async getPositions() {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/positions`, {
        timeout: 30000,
      });
      return response.data.positions || [];
    } catch (err) {
      console.error('[TradeService] Failed to get positions:', err.message);
      return [];
    }
  }

  async getHistory(symbol = null, days = 3) {
    try {
      const url = new URL(`${PYTHON_SERVER_URL}/history`);
      if (symbol) url.searchParams.append('symbol', symbol);
      url.searchParams.append('days', String(days));
      const response = await axios.get(url.toString(), { timeout: 30000 });
      return response.data.history || [];
    } catch (err) {
      console.error('[TradeService] Failed to get history:', err.message);
      return [];
    }
  }

  async getAccountInfo() {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/account`, {
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      console.error('[TradeService] Failed to get account info:', err.message);
      return null;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/symbol-info`, {
        params: { symbol },
        timeout: 5000,
      });
      return response.data;
    } catch (err) {
      return null;
    }
  }

  async getChartHistory(symbol, timeframe = 'H1', count = 500) {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/chart-history`, {
        params: { symbol, timeframe, count },
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      return null;
    }
  }

  async getTicksHistory(symbol, count = 1000) {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/ticks-history`, {
        params: { symbol, count },
        timeout: 30000,
      });
      return response.data;
    } catch (err) {
      return null;
    }
  }
}

export const tradeService = new TradeService();
export default TradeService;
