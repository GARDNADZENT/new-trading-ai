import { newsWatcher } from './newsWatcher.js';
import { analyzer } from './analyzer.js';
import config from '../config.js';

let watcher;

/**
 * Start the scheduler which periodically polls the calendar
 * and hands off events to the NewsWatcher.
 */
export async function startWatcher() {
  watcher = newsWatcher;
  watcher.start();

  // Report scheduler health every 5 minutes
  setInterval(() => {
    const recent = analyzer.history.slice(-5);
    if (recent.length > 0) {
      const titles = recent.map(r => r.event?.title || 'Unknown').join(', ');
      console.log(`[Scheduler] Recent events: ${titles}`);
    }
  }, 300000);

  return watcher;
}

/**
 * Graceful shutdown.
 */
export function stopWatcher() {
  if (watcher) {
    watcher.stop();
  }
}

export default { startWatcher, stopWatcher };
