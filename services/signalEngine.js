import { analyzer } from './analyzer.js';
import { calendarService } from './calendar.js';
import { marketService } from './marketService.js';
import { positionService } from './positionService.js';
import { accountService } from './accountService.js';
import { calculateLotSize, calculateRiskReward, calculateRiskAmount } from './lotCalculator.js';
import { technicalAnalysis } from './technicalAnalysis.js';
import config from '../config.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

class SignalEngine {
  constructor() {
    this.lastSignal = null;
    this.lastSignalTime = 0;
    this.signalCooldownMs = 60000;
  }

  async generateSignal() {
    const now = Date.now();
    if (now - this.lastSignalTime < this.signalCooldownMs) {
      return { action: 'WAIT', reason: 'Signal cooldown active' };
    }

    let account = null;
    try {
      account = await accountService.getAccountInfo();
    } catch {
      return { action: 'WAIT', reason: 'Cannot retrieve account info' };
    }

    if (!account || account.balance == null) {
      return { action: 'WAIT', reason: 'Account unavailable' };
    }

    let positions = [];
    try {
      positions = await positionService.getOpenPositions();
    } catch {
      positions = [];
    }

    const symbol = config.primarySymbol || 'XAUUSD';
    let symbolInfo = null;
    try {
      const marketData = await marketService.getSymbolInfo(symbol);
      symbolInfo = marketData;
    } catch {
      return { action: 'WAIT', reason: `Cannot retrieve market data for ${symbol}` };
    }

    if (!symbolInfo) {
      return { action: 'WAIT', reason: `Symbol ${symbol} not found` };
    }

    const events = await calendarService.fetchAll();
    const upcoming = calendarService.getUpcomingEvents(events, 10);
    const todayEvents = calendarService.getTodayEvents(events);
    const historical = calendarService.getHistoricalEvents(events, 20);

    const usdBias = this._calculateUSDBias(historical, todayEvents);
    const goldBias = this._calculateGoldBias(usdBias, upcoming, todayEvents);
    const technicalBias = await this._calculateTechnicalBias(symbol, symbolInfo);

    const overallBias = this._combineBias(goldBias, technicalBias);

    if (overallBias.action === 'WAIT') {
      return overallBias;
    }

    const entry = symbolInfo.ask || symbolInfo.bid || overallBias.entry;
    const stopLoss = overallBias.stop_loss;
    const takeProfit = overallBias.take_profit;

    if (!entry || !stopLoss || !takeProfit) {
      return { action: 'WAIT', reason: 'Incomplete price levels' };
    }

    const riskReward = calculateRiskReward(entry, stopLoss, takeProfit, overallBias.action);
    if (riskReward != null && riskReward < config.risk.minRiskReward) {
      return { action: 'WAIT', reason: `Risk/reward ${riskReward} below minimum ${config.risk.minRiskReward}` };
    }

    const tickSize = symbolInfo.tick_size || 0.01;
    const tickValue = symbolInfo.tick_value || 1;
    const contractSize = symbolInfo.contract_size || 100;
    const minLot = symbolInfo.min_lot || 0.01;
    const maxLot = symbolInfo.max_lot || 100;
    const lotStep = symbolInfo.lot_step || 0.01;

    const lotSize = calculateLotSize({
      equity: account.equity || account.balance,
      riskPercent: config.risk.maxRiskPerTrade,
      entryPrice: entry,
      stopLossPrice: stopLoss,
      tickSize,
      tickValue,
      contractSize,
      minLot,
      maxLot,
      lotStep,
    });

    if (!lotSize || lotSize <= 0) {
      return { action: 'WAIT', reason: 'Could not calculate valid lot size' };
    }

    const riskAmount = calculateRiskAmount(
      account.equity || account.balance,
      config.risk.maxRiskPerTrade,
      entry,
      stopLoss,
      tickSize,
      tickValue,
      contractSize
    );

    const signal = {
      symbol,
      direction: overallBias.action,
      entry,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      lot_size: lotSize,
      risk_percent: config.risk.maxRiskPerTrade,
      risk_amount: riskAmount || 0,
      risk_reward: riskReward,
      confidence: overallBias.confidence,
      fundamental_reason: overallBias.fundamental_reason,
      technical_reason: overallBias.technical_reason,
      news_reason: overallBias.news_reason,
      invalidation_reason: overallBias.invalidation_reason,
      timestamp: Date.now(),
    };

    this.lastSignal = signal;
    this.lastSignalTime = now;
    return signal;
  }

  _calculateUSDBias(historical, todayEvents) {
    const recentUsd = historical.filter(e => e.currency === 'USD').slice(0, 5);
    let bullishCount = 0;
    let bearishCount = 0;

    for (const ev of recentUsd) {
      if (ev.actual == null || ev.forecast == null) continue;
      const a = parseFloat(String(ev.actual).replace(/[^\d.-]/g, ''));
      const f = parseFloat(String(ev.forecast).replace(/[^\d.-]/g, ''));
      if (isNaN(a) || isNaN(f)) continue;

      const rule = analyzer.rules.get('USD');
      if (rule && typeof rule.determineStrength === 'function') {
        const strength = rule.determineStrength(a > f ? 'above' : a < f ? 'below' : 'equal', ev.category);
        if (strength.USD === 'Bullish') bullishCount++;
        else if (strength.USD === 'Bearish') bearishCount++;
      }
    }

    if (bullishCount > bearishCount + 1) return 'BULLISH';
    if (bearishCount > bullishCount + 1) return 'BEARISH';
    return 'NEUTRAL';
  }

  _calculateGoldBias(usdBias, upcoming, todayEvents) {
    if (usdBias === 'BULLISH') return { action: 'BEARISH', confidence: 60, fundamental_reason: 'Strong USD pressures gold' };
    if (usdBias === 'BEARISH') return { action: 'BULLISH', confidence: 60, fundamental_reason: 'Weak USD supports gold' };
    return { action: 'WAIT', confidence: 0, fundamental_reason: 'USD bias unclear' };
  }

  async _calculateTechnicalBias(symbol, symbolInfo) {
    if (!symbolInfo) return { action: 'NEUTRAL', confidence: 0, technical_reason: 'No market data' };
    
    try {
      const analysis = await technicalAnalysis.analyzeSymbol(symbol, 'H1');
      if (analysis) {
        return {
          action: analysis.signal,
          confidence: analysis.confidence,
          technical_reason: `${analysis.trend} trend | RSI: ${analysis.rsi?.toFixed(1) || 'N/A'} | EMA20: ${analysis.ema20?.toFixed(2) || 'N/A'}`
        };
      }
    } catch (err) {
      console.warn('[SignalEngine] Technical analysis failed:', err.message);
    }
    
    return { action: 'NEUTRAL', confidence: 50, technical_reason: 'Technical analysis placeholder' };
  }

  _combineBias(goldBias, technicalBias) {
    if (goldBias.action === 'WAIT' || technicalBias.action === 'WAIT') {
      return {
        action: 'WAIT',
        confidence: 0,
        fundamental_reason: goldBias.fundamental_reason,
        technical_reason: technicalBias.technical_reason,
        news_reason: 'News analysis pending',
        invalidation_reason: 'Insufficient confluence',
      };
    }

    if (goldBias.action === technicalBias.action) {
      return {
        action: goldBias.action,
        confidence: Math.min(90, goldBias.confidence + technicalBias.confidence),
        fundamental_reason: goldBias.fundamental_reason,
        technical_reason: technicalBias.technical_reason,
        news_reason: 'News and technicals aligned',
        invalidation_reason: 'Price breaks key level against bias',
      };
    }

    return {
      action: 'WAIT',
      confidence: 0,
      fundamental_reason: goldBias.fundamental_reason,
      technical_reason: technicalBias.technical_reason,
      news_reason: 'Fundamental and technical signals conflict',
      invalidation_reason: 'Conflicting signals - no trade',
    };
  }
}

export const signalEngine = new SignalEngine();
export default SignalEngine;
