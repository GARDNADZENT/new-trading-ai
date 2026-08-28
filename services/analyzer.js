import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import config from '../config.js';
import eventBus, { SIGNAL_EVENT } from './eventBus.js';

import ruleUSD from '../rules/usd.js';
import ruleEUR from '../rules/eur.js';
import ruleGBP from '../rules/gbp.js';
import ruleJPY from '../rules/jpy.js';
import ruleCHF from '../rules/chf.js';
import ruleAUD from '../rules/aud.js';
import ruleCAD from '../rules/cad.js';
import ruleNZD from '../rules/nzd.js';

const RULE_REGISTRY = {
  USD: ruleUSD,
  EUR: ruleEUR,
  GBP: ruleGBP,
  JPY: ruleJPY,
  CHF: ruleCHF,
  AUD: ruleAUD,
  CAD: ruleCAD,
  NZD: ruleNZD,
};

class Analyzer {
  constructor() {
    this.rules = new Map();
    this.historyPath = path.resolve('logs/history.json');
    this.history = [];
    this.loadHistory();
    this.loadRules();
  }

  loadRules() {
    for (const [currency, mod] of Object.entries(RULE_REGISTRY)) {
      try {
        this.rules.set(currency, mod.default || mod);
      } catch (err) {
        console.warn(`[Analyzer] Failed to load rule for ${currency}:`, err.message);
      }
    }
  }

  loadHistory() {
    if (fs.existsSync(this.historyPath)) {
      try {
        this.history = JSON.parse(fs.readFileSync(this.historyPath, 'utf8'));
      } catch {
        this.history = [];
      }
    }
  }

  saveHistory() {
    const dir = path.dirname(this.historyPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.historyPath, JSON.stringify(this.history, null, 2));
  }

  generateSignals(event) {
    if (!event || event.actual === null || event.actual === undefined || event.actual === '') {
      return { error: 'No actual value available' };
    }

    const { forecast, previous, actual, currency, category, title } = event;
    const direction = this.compareValues(actual, forecast);

    const currencyStrength = this.determineCurrencyStrength(currency, direction, category);
    const affectedPairs = this.getAffectedPairs(currency, category, event);
    const signals = this.generatePairSignals(currency, direction, category, event, affectedPairs);

    const confidence = this.calculateConfidence(event, direction);
    const optimalHoldingTime = this.calculateHoldingTime(category);

    const result = {
      event: {
        title,
        category,
        timestamp: event.timestamp,
        date: dayjs.unix(event.timestamp).format('YYYY-MM-DD HH:mm:ss'),
      },
      data: {
        forecast: forecast || 'N/A',
        actual: actual,
        previous: previous || 'N/A',
      },
      currencyStrength,
      direction,
      signals,
      confidence,
      optimalHoldingTime,
    };

    this.history.push(result);
    if (this.history.length > 1000) this.history.shift();
    this.saveHistory();

    eventBus.emit(SIGNAL_EVENT, result);

    return result;
  }

  compareValues(actual, forecast) {
    const a = parseFloat(String(actual).replace(/[^\d.-]/g, ''));
    const f = parseFloat(String(forecast).replace(/[^\d.-]/g, ''));
    if (isNaN(a) || isNaN(f)) return 'equal';
    if (a > f) return 'above';
    if (a < f) return 'below';
    return 'equal';
  }

  determineCurrencyStrength(currency, direction, category) {
    const rule = this.rules.get(currency);
    if (rule && typeof rule.determineStrength === 'function') {
      return rule.determineStrength(direction, category);
    }
    return direction === 'above' ? 'Bullish' : direction === 'below' ? 'Bearish' : 'Neutral';
  }

  generatePairSignals(currency, direction, category, event, pairs) {
    const rule = this.rules.get(currency);
    const signals = [];

    for (const pair of pairs) {
      let action = null;
      let strength = 0;

      if (rule && typeof rule.getSignal === 'function') {
        const r = rule.getSignal(pair, direction, category, event);
        if (r) {
          action = r.action;
          strength = r.strength || 3;
        }
      }

      if (!action) {
        action = this.defaultSignal(currency, pair, direction, category);
        strength = this.signalStrength(currency, pair, direction, category);
      }

      signals.push({ pair, action, strength, category });
    }
    return signals;
  }

  getAffectedPairs(currency, category, event) {
    const basePairs = config.currencyPairs[currency] || [];
    const affected = [...basePairs];

    if (currency === 'USD' && config.commodities.USD) {
      affected.push(...config.commodities.USD);
    }
    if (currency === 'CAD' && config.commodities.CAD) {
      affected.push(...config.commodities.CAD);
    }
    if (currency === 'AUD' && config.commodities.AUD) {
      affected.push(...config.commodities.AUD);
    }
    if (currency === 'NZD' && config.commodities.NZD) {
      affected.push(...config.commodities.NZD);
    }

    return [...new Set(affected)];
  }

  defaultSignal(currency, pair, direction) {
    const isBase = pair.startsWith(currency);
    if (direction === 'above') {
      return isBase ? 'BUY' : 'SELL';
    }
    if (direction === 'below') {
      return isBase ? 'SELL' : 'BUY';
    }
    return 'BUY';
  }

  signalStrength(currency, pair, direction, category) {
    const highImpactCats = ['NFP', 'CPI', 'PPI', 'FOMC', 'Interest Rate', 'GDP', 'PMI'];
    const base = highImpactCats.includes(category) ? 4 : 3;
    const isBase = pair.startsWith(currency);
    const aligned = direction === 'above' ? isBase : !isBase;
    return aligned ? base + 1 : base;
  }

  calculateConfidence(event, direction) {
    const similar = this.history.filter(h =>
      h.event.category === event.category &&
      h.direction === direction
    );

    let score = 50;
    if (similar.length > 0) {
      const successRate = similar.filter(h =>
        h.signals.every(s => s.strength >= 3)
      ).length / similar.length;
      score = Math.round(50 + successRate * 40);
    }
    const highImpact = ['NFP', 'CPI', 'FOMC', 'Interest Rate', 'PPI', 'GDP'];
    if (highImpact.includes(event.category)) score += 10;
    return Math.min(100, Math.max(0, score));
  }

  calculateHoldingTime(category) {
    const holdingMap = {
      'NFP': 30, 'Non-Farm Payrolls': 30, 'CPI': 15, 'PPI': 15,
      'Jobless Claims': 10, 'Retail Sales': 15, 'Average Hourly Earnings': 15,
      'Unemployment Rate': 15, 'Interest Rate': 60, 'FOMC': 60,
      'GDP': 30, 'PMI': 15, 'Oil Inventories': 10, 'Trade Balance': 15,
      'Consumer Confidence': 10, 'PCE': 15, 'Services PMI': 15,
      'Manufacturing PMI': 15,
    };
    return holdingMap[category] || 15;
  }

  analyzeHistoricalPerformance(category) {
    const records = this.history.filter(h => h.event.category === category);
    if (records.length === 0) return null;

    const avgConfidence = records.reduce((s, r) => s + r.confidence, 0) / records.length;
    const bestHolding = this.calculateHoldingTime(category);

    return {
      category,
      sampleSize: records.length,
      avgConfidence: Math.round(avgConfidence),
      bestHoldingTime: bestHolding,
    };
  }
}

export const analyzer = new Analyzer();

export function generateSignals(event) {
  return analyzer.generateSignals(event);
}

export default analyzer;
