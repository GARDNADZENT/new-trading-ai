import { calendarService } from './calendar.js';
import { generateSignals, analyzer } from './analyzer.js';
import notifier from './notifier.js';
import eventBus, { SIGNAL_EVENT } from './eventBus.js';
import { tradingLoop } from './tradingLoop.js';
import config from '../config.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

const TZ_OFFSET = (config.timezone.offsetHours || 3) * 60;

class NewsWatcher {
  constructor() {
    this.activeWatch = null;
    this.isRunning = false;
    this.nextEvent = null;
    this.countdownTimer = null;
    this.watchedEventIds = new Set();
  }

  start() {
    this.isRunning = true;
    console.log('[NewsWatcher] Watching for high-impact news events...');
    this.loop();
  }

  stop() {
    this.isRunning = false;
    if (this.activeWatch) clearTimeout(this.activeWatch);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    console.log('[NewsWatcher] Stopped.');
  }

  async loop() {
    if (!this.isRunning) return;
    try {
      const allEvents = await calendarService.fetchAll();
      const upcoming = calendarService.getUpcomingEvents(allEvents, 5);
      const todayEvents = calendarService.getTodayEvents(allEvents);
      const historical = calendarService.getHistoricalEvents(allEvents, 20);

      console.log(`[NewsWatcher] Fetched ${allEvents.length} events (${todayEvents.length} today, ${historical.length} historical, ${upcoming.length} upcoming)`);

      eventBus.emit('events', {
        allEvents,
        upcoming: calendarService.getUpcomingEvents(allEvents, 50),
        todayEvents,
        historical,
      });

      await this.processRecentHistorical(allEvents);

      if (upcoming.length > 0) {
        const next = upcoming[0];
        this.nextEvent = next;
        if (!this.watchedEventIds.has(next.id)) {
          this.watchedEventIds.add(next.id);
          this.watchEvent(next).catch(err => {
            console.error(`[NewsWatcher] Event error: ${next.title || next.id}`, err.message);
          });
        }
      } else {
        console.log('[NewsWatcher] No upcoming events. Rechecking in 60s...');
      }
    } catch (err) {
      console.error('[NewsWatcher] Error in loop:', err.message);
    }
    this.activeWatch = setTimeout(() => this.loop(), config.trading.pollIntervalMs);
  }

  async processRecentHistorical(allEvents) {
    const recent = calendarService.getHistoricalEvents(allEvents, 20);
    const now = Date.now() / 1000;
    const justReleased = recent.filter(e => {
      const age = now - e.timestamp;
      return age < 7 * 24 * 3600 && e.actual !== null && e.actual !== '';
      });

    for (const ev of justReleased) {
      const exists = analyzer.history.some(h =>
        h.event.timestamp === ev.timestamp && h.event.title === ev.title
      );
      if (!exists) {
        const result = generateSignals(ev);
        eventBus.emit(SIGNAL_EVENT, result);
        await notifier.sendSignals(result);
        console.log(`[NewsWatcher] Backfilled signal: ${ev.title} (${result.direction}) confidence: ${result.confidence}%`);
      }
    }
  }

  displayCountdown(event) {
    const now = Math.floor(Date.now() / 1000);
    const eventTime = event.timestamp;
    const nairobiTime = dayjs.unix(eventTime).utcOffset(TZ_OFFSET).format('YYYY-MM-DD HH:mm:ss');
    const timeToEvent = eventTime - now;

    if (timeToEvent <= 0) return;

    const mins = Math.floor(timeToEvent / 60);
    const secs = timeToEvent % 60;
    const impact = (event.impact || 'medium').toUpperCase();

    if (!this._lastCountdownMin || this._lastCountdownMin !== mins) {
      this._lastCountdownMin = mins;
      if (impact === 'HIGH' || impact === 'MEDIUM') {
        const impactColor = impact === 'HIGH' ? '\x1b[31m' : impact === 'MEDIUM' ? '\x1b[33m' : '\x1b[34m';
        const reset = '\x1b[0m';
        console.log(
          `\r\x1b[2K${impactColor}[${impact}]${reset} ` +
          `${event.currency || ''} ${event.title || event.eventName} ` +
          `→ Nairobi: ${nairobiTime} | ${mins}m ${secs}s`
        );
      }
    }

    if (mins < 5 && (impact === 'HIGH' || impact === 'MEDIUM')) {
      process.stderr.write(`\r\x1b[2K⏰ ${mins}:${String(secs).padStart(2, '0')} to ${event.title}`);
    }
  }

  async watchEvent(event) {
    const now = Math.floor(Date.now() / 1000);
    const timeToEvent = event.timestamp - now;
    if (timeToEvent <= 0) return;

    this.startCountdownDisplay(event, timeToEvent);

    const waitMs = Math.max(0, (timeToEvent - 30) * 1000);
    if (waitMs > 0) {
      await new Promise(r => setTimeout(r, waitMs));
    }

    this.stopCountdownDisplay();
    
    const impact = (event.impact || 'medium').toUpperCase();
    if (impact === 'HIGH' || impact === 'MEDIUM') {
      console.log(`\n[NewsWatcher] Release window open for "${event.title}" - polling every 5s...`);
    }

    const updated = await calendarService.pollForActual(event.id, event.timestamp, 300000);

    if (!updated) {
      console.error(`[NewsWatcher] Failed to fetch actual for "${event.title}"`);
      eventBus.emit('error', { message: `Failed to fetch actual for: ${event.title}`, timestamp: Date.now() });
      return;
    }

    const result = generateSignals(updated);
    await notifier.sendSignals(result);

    console.log(`[NewsWatcher] Signal generated for: ${updated.title}`);
  }

  startCountdownDisplay(event, secondsToEvent) {
    this.countdownTimer = setInterval(() => {
      const remaining = Math.floor((event.timestamp - Date.now() / 1000));
      if (remaining <= 0) {
        this.stopCountdownDisplay();
        return;
      }
      this.displayCountdown(event);
    }, 1000);

    this.displayCountdown(event);
  }

  stopCountdownDisplay() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    process.stderr.write('\r\x1b[2K');
  }
}

export const newsWatcher = new NewsWatcher();
export default NewsWatcher;
