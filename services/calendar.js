import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import config from '../config.js';
import { generateScheduleEvents } from './calendar-schedule.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const NZ_TIMEZONE = config.timezone.display || 'Africa/Nairobi';
const TZ_OFFSET_HOURS = config.timezone.offsetHours || 3;

class CalendarService {
  constructor() {
    this.apiKey = config.calendar.apiKey;
    this.apiUrl = config.calendar.apiUrl;
    this.cache = [];
    this.lastFetch = null;
    this.historicalCache = [];
    this.historicalLastFetch = null;
  }

   formatTimeNairobi(timestamp) {
     const d = dayjs.unix(timestamp);
     const offset = d.utcOffset(TZ_OFFSET_HOURS * 60);
     return offset.format('YYYY-MM-DD HH:mm:ss');
   }

    _normalizeTimestamp(value) {
      if (value == null) return Math.floor(Date.now() / 1000);
      if (typeof value === 'number') return Math.floor(value);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return Math.floor(Date.now() / 1000);
        const asNum = Number(trimmed);
        if (!Number.isNaN(asNum) && asNum > 1000000000) return Math.floor(asNum);
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000);
      }
      return Math.floor(Date.now() / 1000);
    }

   /**
    * Fallback using the built-in schedule of known economic events.
    * Provides upcoming events even when no API is available.
    */
   async fetchFallback(from, to, impact, currency) {
    const scheduleEvents = this.generateScheduleFallback(from, to);

    const filtered = scheduleEvents.filter(ev => {
      if (impact && !impact.includes(ev.impact)) return false;
      if (currency && ev.currency !== currency) return false;
      return true;
    });

    this.cache = filtered;
    this.lastFetch = new Date();
    return filtered;
  }

   /**
    * Generate schedule-based events within a date range.
    */
   generateScheduleFallback(from, to) {
     const nowTs = Math.floor(Date.now() / 1000);
     const fromTs = Math.floor(new Date(from).getTime() / 1000);
     const toTs = Math.floor(new Date(to).getTime() / 1000);

     const daysBack = Math.max(0, Math.ceil((nowTs - fromTs) / (24 * 60 * 60)));
     const daysAhead = Math.ceil((toTs - nowTs) / (24 * 60 * 60));

     const schedule = generateScheduleEvents(daysAhead, daysBack);

     return schedule.filter(ev => ev.timestamp >= fromTs && ev.timestamp <= toTs);
   }

   async fetchApifyEvents() {
       const apifyKey = config.calendar?.apify?.apiKey || process.env.APIFY_API_KEY;
       if (!apifyKey) return [];

       try {
         const { apifyService } = await import('./apify.js');
         const items = await apifyService.fetchCalendarFromApify();
         if (items && items.length > 0) {
           return items;
         }
         return [];
       } catch (err) {
         console.warn('[CalendarService] Apify fetch failed:', err.message);
         return [];
       }
      }

   /**
    * Fetch economic events from the calendar API.
    * Defaults to a wide range: yesterday through 7 days ahead.
    * Returns cached data if fetched within the cache TTL.
    */
   async fetchEvents(opts = {}) {
     const {
       from = new Date(Date.now() - 24 * 60 * 60 * 1000),
       to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
       impact = config.trading.impactFilter,
       currency = null,
       skipCache = false,
     } = opts;

     const cacheTTL = (parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10) * 1000) * 3;

     if (!skipCache && this.lastFetch && (Date.now() - this.lastFetch.getTime()) < cacheTTL && this.cache.length > 0) {
       return this.cache;
     }

     const apifyEvents = await this.fetchApifyEvents();
     if (apifyEvents.length > 0) {
       const scheduleEvents = this.generateScheduleFallback(from, to);
       const merged = this.mergeEvents(apifyEvents, scheduleEvents);
       this.cache = merged;
       this.lastFetch = new Date();
       return merged;
     }

     console.warn('[CalendarService] Apify failed, using schedule fallback...');
     return this.fetchFallback(from, to, impact, currency);
   }

   extractCurrency(title) {
    if (!title) return null;
    const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF'];
    for (const c of currencies) {
      if (title.includes(c)) return c;
    }
    return 'USD';
  }

  categorizeEvent(title) {
    const t = title.toLowerCase();
    const categories = [
      { name: 'NFP', match: ['non-farm', 'nonfarm', 'payrolls', 'employment change'] },
      { name: 'CPI', match: ['cpi', 'consumer price'] },
      { name: 'PPI', match: ['ppi', 'producer price'] },
      { name: 'PCE', match: ['pce'] },
      { name: 'PMI', match: ['pmi'] },
      { name: 'Jobless Claims', match: ['jobless', 'unemployment claims', 'initial jobless'] },
      { name: 'Retail Sales', match: ['retail sales'] },
      { name: 'GDP', match: ['gdp', 'gross domestic'] },
      { name: 'FOMC', match: ['fomc', 'fed'] },
      { name: 'Interest Rate', match: ['interest rate', 'rate decision', 'repo', 'federal funds'] },
      { name: 'Average Hourly Earnings', match: ['average hourly'] },
      { name: 'Unemployment Rate', match: ['unemployment rate'] },
      { name: 'Oil Inventories', match: ['oil inventories', 'crude'] },
      { name: 'Trade Balance', match: ['trade balance'] },
      { name: 'Consumer Confidence', match: ['confidence'] },
    ];
    for (const cat of categories) {
      if (cat.match.some(m => t.includes(m))) return cat.name;
    }
    return 'General';
  }

   /**
    * Fetch upcoming events (now through N days ahead).
    */
   async fetchUpcoming(days = 7) {
    const from = new Date();
    const to = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const events = await this.fetchEvents({ from, to });
    return this.getUpcomingEvents(events, 100);
  }

  /**
   * Fetch events for today only (Nairobi timezone).
   */
  async fetchToday() {
    const nowUtc = dayjs.utc();
    const nairobiNow = nowUtc.utcOffset(TZ_OFFSET_HOURS * 60);
    const startOfDay = nairobiNow.startOf('day');
    const endOfDay = nairobiNow.add(1, 'day').startOf('day');

    const from = new Date(startOfDay.valueOf());
    const to = new Date(endOfDay.valueOf());
    const fromTs = Math.floor(startOfDay.valueOf() / 1000);
    const toTs = Math.floor(endOfDay.valueOf() / 1000);

    const cacheTTL = (parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10) * 1000) * 3;
    if (this.lastFetch && (Date.now() - this.lastFetch.getTime()) < cacheTTL && this.cache.length > 0) {
      return this.cache.filter(e => e.timestamp >= fromTs && e.timestamp < toTs);
    }

    const events = await this.fetchEvents({ from, to, skipCache: true });
    return this.getTodayEvents(events);
  }

  /**
   * Fetch ALL events: historical + today + upcoming.
   * Covers the past 3 days through 7 days ahead for a complete view.
   */
   async fetchAll() {
     const from = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
     const to = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
     const calendarEvents = await this.fetchEvents({ from, to });

      const merged = this.mergeEvents(calendarEvents);

      this.cache = merged;
     this.lastFetch = new Date();
     return merged;
   }

   mergeEvents(...eventArrays) {
     const result = [];

     for (const events of eventArrays) {
       for (const ev of events) {
         if (!ev) continue;
         const existing = result.find(r => {
           if (r.id && r.id === ev.id) return true;
           if (r.timestamp === ev.timestamp && r.currency === ev.currency) return true;
           return false;
         });

         if (!existing) {
           result.push(ev);
         } else if (ev.actual && !existing.actual) {
           existing.actual = ev.actual;
           existing.rawActual = ev.rawActual;
           existing.estimated = false;
           if (ev.previous && !existing.previous) existing.previous = ev.previous;
         }
       }
     }
     return result;
   }

  /**
   * Get all past events (already released with actual values) from cache.
   */
  getHistoricalEvents(allEvents, limit = 50) {
    const now = Date.now() / 1000;
    return allEvents
      .filter(e => e.timestamp < now && e.actual !== null && e.actual !== undefined && e.actual !== '')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get today's events from a sorted event list, filtered by Nairobi timezone.
   */
  getTodayEvents(allEvents) {
    const nowUtc = dayjs.utc();
    const nairobiNow = nowUtc.utcOffset(TZ_OFFSET_HOURS * 60);
    const startOfDay = nairobiNow.startOf('day');
    const endOfDay = nairobiNow.add(1, 'day').startOf('day');
    const startTs = Math.floor(startOfDay.valueOf() / 1000);
    const endTs = Math.floor(endOfDay.valueOf() / 1000);
    return allEvents
      .filter(e => e.timestamp >= startTs && e.timestamp < endTs)
      .sort((a, b) => a.timestamp - a.timestamp);
  }

  /**
   * Get next upcoming events sorted by timestamp.
   */
  getUpcomingEvents(events, limit = 20) {
    const now = Date.now() / 1000;
    return events
      .filter(e => e.timestamp > now && !e.released)
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, limit);
  }

  /**
   * Find an event by exact timestamp and keyword.
   */
  findEvent(events, timestamp, keyword) {
    const ts = typeof timestamp === 'number' ? timestamp : Math.floor(new Date(timestamp).getTime() / 1000);
    const kw = keyword.toLowerCase();
    return events.find(e =>
      Math.abs(e.timestamp - ts) < 300 &&
      e.title.toLowerCase().includes(kw)
    );
  }

  /**
   * Poll for updated actual values after release.
   * Uses aggressive 1-second polling during the release window.
   */
  async pollForActual(eventId, timestamp, maxWaitMs = 300000) {
    const deadline = Date.now() + maxWaitMs;
    const releaseWindowMs = 120000; // Poll aggressively for 2 min after release
    const aggressiveDeadline = Date.now() + releaseWindowMs;

    while (Date.now() < deadline) {
      const events = await this.fetchAll();
      const found = events.find(e => (e.id === eventId || e.timestamp === timestamp));

      if (found && found.actual !== null && found.actual !== undefined && found.actual !== '') {
        return found;
      }

      const pollInterval = Date.now() < aggressiveDeadline
        ? config.trading.releasePollIntervalMs
        : 5000;

      await new Promise(r => setTimeout(r, pollInterval));
    }
    return null;
  }
}

export const calendarService = new CalendarService();
export default CalendarService;
