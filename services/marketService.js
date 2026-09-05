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
      // Resolve actual broker symbol name
      const actualSymbol = await this.resolveSymbol(symbol);
      const result = await tradeService.getChartHistory(actualSymbol, timeframe, count);
      return result;
    } catch (err) {
      console.error('[MarketService] getChartHistory failed:', err.message);
      throw err;
    }
  }

  async resolveSymbol(symbol) {
    // Try to get the actual broker symbol name from instrument resolver
    try {
      const { resolveOne } = await import('./instrumentResolver.js');
      const resolved = await resolveOne(symbol);
      if (resolved && resolved.actualSymbol) {
        return resolved.actualSymbol;
      }
    } catch {
      // Fallback to original symbol
    }
    return symbol;
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
