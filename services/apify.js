import axios from 'axios';
import config from '../config.js';

const APIFY_ACTOR_ID = 'scrapemint~forexfactory-economic-calendar';

class ApifyService {
  constructor() {
    this.apiKey = config.calendar?.apify?.apiKey || process.env.APIFY_API_KEY;
    this.baseUrl = config.calendar?.apify?.baseUrl || process.env.APIFY_BASE_URL || 'https://api.apify.com';
    this.actorId = APIFY_ACTOR_ID;
  }

  _authParams() {
    return this.apiKey ? { token: this.apiKey } : {};
  }

  async getLastRunDatasetItems(limit = 100) {
    if (!this.apiKey) return null;
    try {
      const url = `${this.baseUrl}/v2/actors/${this.actorId}/runs/last/dataset/items`;
      const resp = await axios.get(url, {
        params: { ...this._authParams(), limit, format: 'json' },
        timeout: 30000,
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } catch (err) {
      console.warn('[Apify] getLastRunDatasetItems failed:', err.message);
      return null;
    }
  }

  async runActorSync(input = {}, timeoutMs = 120000) {
    if (!this.apiKey) return null;
    try {
      const url = `${this.baseUrl}/v2/actors/${this.actorId}/run-sync-get-dataset-items`;
      const resp = await axios.post(url, input, {
        params: { ...this._authParams(), timeout: Math.floor(timeoutMs / 1000) },
        timeout: timeoutMs + 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } catch (err) {
      console.warn('[Apify] runActorSync failed:', err.message);
      return null;
    }
  }

  async runActor(input = {}, timeoutMs = 60000) {
    if (!this.apiKey) return null;
    try {
      const url = `${this.baseUrl}/v2/actors/${this.actorId}/runs`;
      const resp = await axios.post(url, input, {
        params: { ...this._authParams(), wait: Math.floor(timeoutMs / 1000), memory: '256' },
        timeout: timeoutMs + 10000,
        headers: { 'Content-Type': 'application/json' },
      });
      return resp.data;
    } catch (err) {
      console.warn('[Apify] runActor failed:', err.message);
      return null;
    }
  }

  async getRunDatasetItems(runId, limit = 100) {
    if (!this.apiKey) return null;
    try {
      const url = `${this.baseUrl}/v2/actors/${this.actorId}/runs/${runId}/dataset/items`;
      const resp = await axios.get(url, {
        params: { ...this._authParams(), limit, format: 'json' },
        timeout: 30000,
      });
      return Array.isArray(resp.data) ? resp.data : [];
    } catch (err) {
      console.warn('[Apify] getRunDatasetItems failed:', err.message);
      return null;
    }
  }

  normalizeForexFactoryItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(item => {
      const rawTs = item.timestamp || Math.floor(Date.now() / 1000);
      let ts = rawTs;
      if (typeof rawTs === 'string') {
        const asNum = Number(rawTs);
        if (!Number.isNaN(asNum) && asNum > 1000000000) {
          ts = Math.floor(asNum);
        } else {
          const parsed = new Date(rawTs.trim());
          if (!Number.isNaN(parsed.getTime())) {
            ts = Math.floor(parsed.getTime() / 1000);
          }
        }
      }
      return {
        id: `${item.timestamp || Date.now()}-${item.title || 'apify'}`,
        timestamp: ts,
        date: item.date || new Date(ts * 1000).toISOString().split('T')[0],
        time: item.time || null,
        timezone: item.timezone || 'UTC',
        title: item.title || item.event || item.name,
        currency: item.currency || this._extractCurrency(item.title || ''),
        impact: item.impact || 'medium',
        forecast: item.forecast || null,
        previous: item.previous || null,
        actual: item.actual || null,
        unit: item.unit || '',
        eventName: item.event_name || item.title,
        category: item.category || 'General',
        released: !!item.actual,
        source: 'apify',
      };
    });
  }

  async fetchCalendarFromApify() {
    if (!this.apiKey) return [];

    const items = await this.getLastRunDatasetItems(200);
    if (items && items.length > 0) {
      return this.normalizeForexFactoryItems(items);
    }

    const syncItems = await this.runActorSync({}, 120000);
    if (syncItems && syncItems.length > 0) {
      return this.normalizeForexFactoryItems(syncItems);
    }

    return [];
  }

  _extractCurrency(title) {
    if (!title) return null;
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'];
    for (const c of currencies) {
      if (title.includes(c)) return c;
    }
    return 'USD';
  }
}

export const apifyService = new ApifyService();
export default ApifyService;
