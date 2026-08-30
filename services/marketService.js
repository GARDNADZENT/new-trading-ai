import { tradeService } from './tradeService.js';

class MarketService {
  async getMarketWatchSymbols() {
    try {
      const positions = await tradeService.getPositions();
      if (positions && positions.length > 0) {
        const symbols = [...new Set(positions.map(p => p.symbol).filter(Boolean))];
        return { symbols: symbols.map(s => ({ symbol: s })) };
      }
      return { symbols: [] };
    } catch (err) {
      console.error('[MarketService] getMarketWatchSymbols failed:', err.message);
      throw err;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const result = await tradeService.getSymbolInfo(symbol);
      if (result && result.symbol) {
        return { symbols: [result] };
      }
      return result;
    } catch (err) {
      console.error('[MarketService] getSymbolInfo failed:', err.message);
      throw err;
    }
  }

  async getChartHistory(symbol, timeframe, count = 500) {
    try {
      const result = await tradeService.getChartHistory(symbol, timeframe, count);
      return result;
    } catch (err) {
      console.error('[MarketService] getChartHistory failed:', err.message);
      throw err;
    }
  }

  async getTicksHistory(symbol, from = null, to = null) {
    try {
      const result = await tradeService.getTicksHistory(symbol, 1000);
      return result;
    } catch (err) {
      console.error('[MarketService] getTicksHistory failed:', err.message);
      throw err;
    }
  }

  async addSymbolToMarketWatch(symbol) {
    try {
      return await tradeService.getSymbolInfo(symbol);
    } catch (err) {
      console.error('[MarketService] addSymbolToMarketWatch failed:', err.message);
      throw err;
    }
  }

  async getPriceFromTwelveData(symbol, exchange = 'FOREXCOM') {
    try {
      const { twelveDataService } = await import('./twelveData.js');
      const data = await twelveDataService.getPrice(symbol, exchange);
      if (data) {
        return {
          symbol,
          bid: parseFloat(data.price) || null,
          ask: parseFloat(data.price) || null,
          source: 'twelvedata',
        };
      }
      return null;
    } catch (err) {
      console.warn('[MarketService] TwelveData fallback failed:', err.message);
      return null;
    }
  }
}

export const marketService = new MarketService();
export default MarketService;
