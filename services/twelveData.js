import axios from 'axios';
import config from '../config.js';

class TwelveDataService {
  constructor() {
    this.apiKey = config.calendar?.twelveData?.apiKey || process.env.TWELVE_DATA_API_KEY;
    this.baseUrl = config.calendar?.twelveData?.baseUrl || process.env.TWELVE_DATA_BASE_URL || 'https://api.twelvedata.com';
  }

  async getPrice(symbol, exchange = 'FOREXCOM') {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(`${this.baseUrl}/price`, {
        params: { symbol, exchange, apikey: this.apiKey },
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      console.warn('[TwelveData] getPrice failed:', err.message);
      return null;
    }
  }

  async getQuote(symbol, exchange = 'FOREXCOM') {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(`${this.baseUrl}/quote`, {
        params: { symbol, exchange, apikey: this.apiKey },
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      console.warn('[TwelveData] getQuote failed:', err.message);
      return null;
    }
  }

  async getTimeSeries(symbol, interval = '1h', exchange = 'FOREXCOM', outputsize = 100) {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(`${this.baseUrl}/time_series`, {
        params: { symbol, interval, exchange, outputsize, apikey: this.apiKey },
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      console.warn('[TwelveData] getTimeSeries failed:', err.message);
      return null;
    }
  }

  async getForexRates(base = 'USD') {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(`${this.baseUrl}/forex_rates`, {
        params: { base, apikey: this.apiKey },
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      console.warn('[TwelveData] getForexRates failed:', err.message);
      return null;
    }
  }

  async getSymbolSearch(keyword) {
    if (!this.apiKey) return null;
    try {
      const resp = await axios.get(`${this.baseUrl}/symbol_search`, {
        params: { symbol: keyword, apikey: this.apiKey },
        timeout: 10000,
      });
      return resp.data;
    } catch (err) {
      console.warn('[TwelveData] getSymbolSearch failed:', err.message);
      return null;
    }
  }
}

export const twelveDataService = new TwelveDataService();
export default TwelveDataService;
