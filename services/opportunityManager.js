import { signalEngine } from '../signalEngine.js';
import { marketService } from '../marketService.js';
import { accountService } from './accountService.js';
import { positionService } from './positionService.js';
import { tradeService } from './tradeService.js';
import { tradePlanner } from '../tradePlanner.js';
import { riskEngine } from '../riskEngine.js';
import { tradeLogger } from '../tradeLogger.js';
import { getLiveDataService } from '../liveDataService.js';
import { marketSession } from '../marketSession.js';
import { pairManager } from '../pairManager.js';
import { getMarketRegime } from './strategies/marketRegime.js';
import { scan as scanScalping, defaultSettings as scalpingSettings } from './strategies/scalping.js';
import { scan as scanSniper, defaultSettings as sniperSettings } from './strategies/sniper.js';
import { scan as scanTrend, defaultSettings as trendSettings } from './strategies/trend.js';
import { scan as scanBreakout, defaultSettings: breakoutSettings } from './strategies/breakout.js';
import { scan as scanReversal, defaultSettings: reversalSettings } from './strategies/reversal.js';
import { scan as scanMomentum, defaultSettings: momentumSettings } from './strategies/momentum.js';
import { scan as scanRange, defaultSettings: rangeSettings } from './strategies/range.js';
import eventBus, { SIGNAL_EVENT } from '../eventBus.js';
import config from '../../config.js';
import dayjs from 'dayjs';

const STRATEGIES = [
  { name: 'NEWS', enabled: true, scan: null },
  { name: 'SCALPING', enabled: scalpingSettings.enabled, scan: scanScalping },
  { name: 'SNIPER', enabled: sniperSettings.enabled, scan: scanSniper },
  { name: 'TREND', enabled: trendSettings.enabled, scan: scanTrend },
  { name: 'BREAKOUT', enabled: breakoutSettings.enabled, scan: scanBreakout },
  { name: 'REVERSAL', enabled: reversalSettings.enabled, scan: scanReversal },
  { name: 'MOMENTUM', enabled: momentumSettings.enabled, scan: scanMomentum },
  { name: 'RANGE', enabled: rangeSettings.enabled, scan: scanRange },
];

class OpportunityManager {
  constructor() {
    this.opportunities = [];
    this.lastScan = 0;
    this.scanIntervalMs = (config.trading?.pollIntervalMs || 60000);
    this.regimeCache = new Map();
    this.marketDataCache = new Map();
    this.cacheTTL = 10000;
  }

  async scanAll() {
    const now = Date.now();
    if (now - this.lastScan < this.scanIntervalMs) {
      return this.opportunities;
    }
    this.lastScan = now;

    const selected = pairManager.getSelectedPairs();
    if (!selected.length) selected.push(config.primarySymbol || 'XAUUSD');

    const results = [];
    for (const symbol of selected) {
      if (!marketSession.isPairTradeableNow(symbol)) continue;

      let marketData = null;
      try {
        marketData = await pairManager.getPairSnapshot(symbol);
      } catch {
        continue;
      }
      if (!marketData?.available) continue;

      const regime = await getMarketRegime(symbol, 'M5', 100);
      this.regimeCache.set(symbol, { regime, ts: now });

      for (const strategy of STRATEGIES) {
        if (!strategy.enabled || !strategy.scan) continue;
        if (strategy.name === 'NEWS') continue;

        try {
          const opp = await strategy.scan(symbol, marketData);
          if (opp) {
            opp.marketRegime = regime.regime;
            results.push(opp);
          }
        } catch (err) {
          console.warn(`[OpportunityManager] ${strategy.name} scan failed for ${symbol}:`, err.message);
        }
      }
    }

    this.opportunities = results;
    return results;
  }

  rank(opportunities) {
    const sorted = [...opportunities].sort((a, b) => b.score - a.score);
    return sorted;
  }

  resolveConflicts(opportunities) {
    const symbolGroups = {};
    for (const opp of opportunities) {
      if (!symbolGroups[opp.symbol]) symbolGroups[opp.symbol] = [];
      symbolGroups[opp.symbol].push(opp);
    }

    const best = [];
    for (const [symbol, opps] of Object.entries(symbolGroups)) {
      const sorted = opps.sort((a, b) => b.score - a.score);
      const top = sorted[0];
      if (top) best.push(top);
    }
    return best;
  }

  getBestOpportunity() {
    const ranked = this.rank(this.opportunities);
    return ranked[0] || null;
  }

  addNewsOpportunity(opp) {
    if (!opp) return;
    this.opportunities.push({ ...opp, strategy: 'NEWS' });
  }

  clear() {
    this.opportunities = [];
  }

  getStatus() {
    return {
      opportunities: this.opportunities,
      best: this.getBestOpportunity(),
      lastScan: this.lastScan,
    };
  }
}

export const opportunityManager = new OpportunityManager();
export default opportunityManager;
