import { tradeService } from './tradeService.js';

class PositionService {
  async getOpenPositions(symbol = null) {
    try {
      const result = symbol
        ? await tradeService.getPositions().then(positions => positions.filter(p => (p.symbol || '') === symbol))
        : await tradeService.getPositions();
      return result;
    } catch (err) {
      console.error('[PositionService] getOpenPositions failed:', err.message);
      throw err;
    }
  }

  async getHistoryPositions(symbol = null, from = null, to = null) {
    try {
      const history = await tradeService.getHistory(symbol, 3);
      return { history };
    } catch (err) {
      console.error('[PositionService] getHistoryPositions failed:', err.message);
      throw err;
    }
  }

  async getHistoryOrders(symbol = null, from = null, to = null) {
    try {
      const history = await tradeService.getHistory(symbol, 3);
      return { history };
    } catch (err) {
      console.error('[PositionService] getHistoryOrders failed:', err.message);
      throw err;
    }
  }

  async closePosition(symbol, positionTicket) {
    try {
      const result = await tradeService.cancelOrder(symbol, positionTicket);
      return result;
    } catch (err) {
      console.error('[PositionService] closePosition failed:', err.message);
      throw err;
    }
  }

  async modifyPosition(symbol, positionTicket, sl = null, tp = null) {
    try {
      const result = await tradeService.modifyPosition(symbol, positionTicket, sl, tp);
      return result;
    } catch (err) {
      console.error('[PositionService] modifyPosition failed:', err.message);
      throw err;
    }
  }

  async deleteOrder(symbol, orderTicket) {
    try {
      const result = await tradeService.cancelOrder(symbol, orderTicket);
      return result;
    } catch (err) {
      console.error('[PositionService] deleteOrder failed:', err.message);
      throw err;
    }
  }
}

export const positionService = new PositionService();
export default PositionService;
