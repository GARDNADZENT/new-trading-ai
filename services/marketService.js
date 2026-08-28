import mt5MCP from './mt5MCP.js';

class MarketService {
  async getMarketWatchSymbols() {
    try {
      const result = await mt5MCP.callTool('get_marketwatch_symbols', {});
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
      console.error('[MarketService] getMarketWatchSymbols failed:', err.message);
      throw err;
    }
  }

  async getSymbolInfo(symbol) {
    try {
      const result = await mt5MCP.callTool('get_marketwatch_symbols', { symbol });
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
      console.error('[MarketService] getSymbolInfo failed:', err.message);
      throw err;
    }
  }

  async getChartHistory(symbol, timeframe, count = 500) {
    try {
      const to = new Date().toISOString();
      const from = new Date(Date.now() - count * 3600 * 1000).toISOString();
      const params = { symbol, datetime_from: from, datetime_to: to, period: timeframe, limit: count };
      const result = await mt5MCP.callTool('get_chart_history', params);
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
      console.error('[MarketService] getChartHistory failed:', err.message);
      throw err;
    }
  }

  async getTicksHistory(symbol, from = null, to = null) {
    try {
      const params = { symbol };
      if (from) params.datetime_from = from;
      if (to) params.datetime_to = to;
      const result = await mt5MCP.callTool('get_chart_ticks_history', params);
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
      console.error('[MarketService] getTicksHistory failed:', err.message);
      throw err;
    }
  }

  async addSymbolToMarketWatch(symbol) {
    try {
      const result = await mt5MCP.callTool('add_marketwatch_symbol', { symbol });
      return result;
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
