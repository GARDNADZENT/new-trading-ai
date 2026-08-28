import axios from 'axios';
import config from '../config.js';

const PYTHON_SERVER_URL = process.env.MT5_PYTHON_SERVER_URL || 'http://localhost:8000';

class TradeService {
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

  async getOpenOrders(symbol = null) {
    try {
      const url = symbol ? `${PYTHON_SERVER_URL}/orders?symbol=${encodeURIComponent(symbol)}` : `${PYTHON_SERVER_URL}/orders`;
      const response = await axios.get(url, { timeout: 10000 });
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
        timeout: 10000,
      });
      return response.data.positions || [];
    } catch (err) {
      console.error('[TradeService] Failed to get positions:', err.message);
      return [];
    }
  }

  async getAccountInfo() {
    try {
      const response = await axios.get(`${PYTHON_SERVER_URL}/account`, {
        timeout: 10000,
      });
      return response.data;
    } catch (err) {
      console.error('[TradeService] Failed to get account info:', err.message);
      return null;
    }
  }
}

export const tradeService = new TradeService();
export default TradeService;
