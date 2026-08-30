import { accountService } from './accountService.js';
import { marketService } from './marketService.js';
import { positionService } from './positionService.js';
import { tradeService } from './tradeService.js';
import config from '../config.js';

const POLL_INTERVAL_MS = (config.liveData?.pollIntervalMs || 2000);

class LiveDataService {
  constructor(io) {
    this.io = io;
    this.running = false;
    this.intervalId = null;
    this.lastAccount = null;
    this.lastPositions = null;
    this.lastMarket = null;
    this.lastUpdate = null;
    this.connected = false;
    this.staleThresholdMs = (config.liveData?.staleThresholdMs || 10000);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.poll();
    this.intervalId = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  stop() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async poll() {
    if (!this.running) return;
    try {
      const health = await tradeService.healthCheck();
      this.connected = !!health && health.status === 'connected';
      this.lastUpdate = Date.now();

      const account = await accountService.getAccountInfo();
      const positionsResult = await positionService.getOpenPositions();
      const positions = Array.isArray(positionsResult) ? positionsResult : (positionsResult?.positions || []);
      const market = await marketService.getMarketWatchSymbols();
      const marketSymbols = market?.symbols || [];

      if (this.hasAccountChanged(account)) {
        this.lastAccount = account;
        this.io.emit('mt5_account_update', account);
      }

      if (this.hasPositionsChanged(positions)) {
        this.lastPositions = positions;
        this.io.emit('mt5_positions_update', positions);
      }

      if (this.hasMarketChanged(marketSymbols)) {
        this.lastMarket = marketSymbols;
        this.io.emit('mt5_market_update', { symbols: marketSymbols });
      }

      this.io.emit('mt5_heartbeat', {
        connected: this.connected,
        lastUpdate: this.lastUpdate,
        stale: this.isStale(),
      });
    } catch (err) {
      this.connected = false;
      this.io.emit('mt5_connection_status', { status: 'ERROR', error: err.message });
    }
  }

  hasAccountChanged(account) {
    if (!this.lastAccount) return true;
    return (
      this.lastAccount.balance !== account.balance ||
      this.lastAccount.equity !== account.equity ||
      this.lastAccount.margin_free !== account.margin_free ||
      this.lastAccount.margin !== account.margin
    );
  }

  hasPositionsChanged(positions) {
    if (!this.lastPositions) return true;
    if (positions.length !== this.lastPositions.length) return true;
    return positions.some((p, i) => {
      const prev = this.lastPositions[i];
      return (
        p.profit !== prev.profit ||
        p.price_last !== prev.price_last ||
        p.volume !== prev.volume
      );
    });
  }

  hasMarketChanged(market) {
    if (!this.lastMarket) return true;
    if (this.lastMarket.length !== market.length) return true;
    return market.some((s, i) => {
      const prev = this.lastMarket[i];
      return s.bid !== prev.bid || s.ask !== prev.ask;
    });
  }

  isStale() {
    if (!this.lastUpdate) return true;
    return Date.now() - this.lastUpdate > this.staleThresholdMs;
  }

  getStatus() {
    return {
      connected: this.connected,
      lastUpdate: this.lastUpdate,
      stale: this.isStale(),
      staleThreshold: this.staleThresholdMs,
    };
  }
}

export default LiveDataService;
export { LiveDataService };

let liveDataInstance = null;
export function getLiveDataService(io) {
  if (!liveDataInstance) {
    liveDataInstance = new LiveDataService(io);
  }
  return liveDataInstance;
}
