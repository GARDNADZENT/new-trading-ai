import config from '../config.js';
import { accountService } from './accountService.js';
import { positionService } from './positionService.js';
import { marketService } from './marketService.js';
import { calendarService } from './calendar.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ_OFFSET = (config.timezone.offsetHours || 3) * 60;

class RiskEngine {
  constructor() {
    this.dailyLoss = 0;
    this.dailyTrades = 0;
    this.lastResetDate = null;
  }

  _resetDailyIfNeeded() {
    const now = dayjs().utc().utcOffset(TZ_OFFSET).format('YYYY-MM-DD');
    if (this.lastResetDate !== now) {
      this.dailyLoss = 0;
      this.dailyTrades = 0;
      this.lastResetDate = now;
    }
  }

  async validateTrade(signal) {
    this._resetDailyIfNeeded();
    const errors = [];
    const warnings = [];

    if (!config.tradingMode.enabled) {
      errors.push('Trading is disabled (TRADING_ENABLED=false)');
      return { approved: false, errors, warnings, reason: 'Trading disabled' };
    }

    if (config.tradingMode.mode !== 'AUTONOMOUS') {
      errors.push(`Trading mode is ${config.tradingMode.mode}, not AUTONOMOUS`);
      return { approved: false, errors, warnings, reason: 'Wrong mode' };
    }

    if (config.tradingMode.emergencyClose) {
      errors.push('Emergency close is active');
      return { approved: false, errors, warnings, reason: 'Emergency close' };
    }

    if (signal.dataStale) {
      errors.push('Market data is stale, cannot execute trade');
      return { approved: false, errors, warnings, reason: 'Stale data' };
    }

    let account = null;
    try {
      account = await accountService.getAccountInfo();
    } catch (err) {
      errors.push(`Cannot retrieve account info: ${err.message}`);
      return { approved: false, errors, warnings, reason: 'Account unavailable' };
    }

    if (!account || account.balance == null) {
      errors.push('Account balance unavailable');
      return { approved: false, errors, warnings, reason: 'Account unavailable' };
    }

    const equity = account.equity || account.balance;
    const balance = account.balance;

    if (this.dailyLoss <= config.risk.maxDailyLoss * -1) {
      errors.push(`Daily loss limit reached: ${this.dailyLoss.toFixed(2)} (max: ${config.risk.maxDailyLoss})`);
      return { approved: false, errors, warnings, reason: 'Daily loss limit' };
    }

    let positions = [];
    try {
      const posResult = await positionService.getOpenPositions();
      positions = Array.isArray(posResult) ? posResult : (posResult?.positions || []);
    } catch {
      warnings.push('Cannot retrieve open positions');
      positions = [];
    }

    const openTrades = positions.length;
    if (openTrades >= config.risk.maxOpenTrades) {
      errors.push(`Max open trades reached: ${openTrades} (max: ${config.risk.maxOpenTrades})`);
      return { approved: false, errors, warnings, reason: 'Max open trades' };
    }

    const symbolExposure = positions
      .filter(p => (p.symbol || '') === signal.symbol)
      .reduce((sum, p) => sum + (parseFloat(p.volume) || 0), 0);
    if (symbolExposure + signal.lot_size > config.risk.maxSymbolExposure) {
      errors.push(`Symbol exposure would exceed limit: ${symbolExposure} + ${signal.lot_size} > ${config.risk.maxSymbolExposure}`);
      return { approved: false, errors, warnings, reason: 'Symbol exposure limit' };
    }

    if (config.risk.requireStopLoss && (signal.stop_loss == null || signal.stop_loss === 0)) {
      errors.push('Stop loss is required but not provided');
      return { approved: false, errors, warnings, reason: 'No stop loss' };
    }

    if (config.risk.requireTakeProfit && (signal.take_profit == null || signal.take_profit === 0)) {
      errors.push('Take profit is required but not provided');
      return { approved: false, errors, warnings, reason: 'No take profit' };
    }

    if (signal.risk_reward != null && signal.risk_reward < config.risk.minRiskReward) {
      errors.push(`Risk/reward ${signal.risk_reward} below minimum ${config.risk.minRiskReward}`);
      return { approved: false, errors, warnings, reason: 'Risk/reward too low' };
    }

    if (signal.lot_size <= 0) {
      errors.push('Lot size must be positive');
      return { approved: false, errors, warnings, reason: 'Invalid lot size' };
    }

    const riskAmount = Math.round(equity * (config.risk.maxRiskPerTrade / 100) * 100) / 100;
    const signalRisk = Math.round(signal.risk_amount * 100) / 100;
    if (signalRisk > riskAmount) {
      errors.push(`Risk amount ${signalRisk.toFixed(2)} exceeds max per trade ${riskAmount.toFixed(2)}`);
      return { approved: false, errors, warnings, reason: 'Risk amount exceeded' };
    }

    if (config.risk.highImpactNewsLock) {
      const lockBefore = config.risk.newsLockBeforeMinutes * 60;
      const lockAfter = config.risk.newsLockAfterMinutes * 60;
      const now = Math.floor(Date.now() / 1000);
      try {
        const events = await calendarService.fetchUpcoming(2);
        const highImpact = events.filter(e => e.impact === 'high' && e.currency === 'USD');
        for (const ev of highImpact) {
          const diff = ev.timestamp - now;
          if (diff > -lockAfter && diff < lockBefore) {
            warnings.push(`High-impact USD news within lock window: ${ev.title} in ${Math.max(0, Math.floor(diff / 60))}m`);
          }
        }
      } catch {
        warnings.push('Could not check news lock window');
      }
    }

    return {
      approved: true,
      errors,
      warnings,
      reason: warnings.length > 0 ? 'Approved with warnings' : 'All checks passed',
      account,
      positions,
    };
  }

  async validateNewsTrade({ symbol, direction, lot_size, stop_loss, take_profit, risk_amount, entry_price, newsEventId }) {
    this._resetDailyIfNeeded();
    const errors = [];
    const warnings = [];

    if (!config.tradingMode.enabled) {
      errors.push('Trading is disabled (TRADING_ENABLED=false)');
      return { approved: false, errors, warnings, reason: 'Trading disabled' };
    }

    if (config.tradingMode.mode !== 'AUTONOMOUS') {
      errors.push(`Trading mode is ${config.tradingMode.mode}, not AUTONOMOUS`);
      return { approved: false, errors, warnings, reason: 'Wrong mode' };
    }

    if (config.tradingMode.emergencyClose) {
      errors.push('Emergency close is active');
      return { approved: false, errors, warnings, reason: 'Emergency close' };
    }

    if (config.tradingMode.paused) {
      errors.push('Trading is paused');
      return { approved: false, errors, warnings, reason: 'Trading paused' };
    }

    if (!config.newsBreakout?.enabled) {
      errors.push('News breakout mode is disabled');
      return { approved: false, errors, warnings, reason: 'News breakout disabled' };
    }

    let account = null;
    try {
      account = await accountService.getAccountInfo();
    } catch (err) {
      errors.push(`Cannot retrieve account info: ${err.message}`);
      return { approved: false, errors, warnings, reason: 'Account unavailable' };
    }

    if (!account || account.balance == null) {
      errors.push('Account balance unavailable');
      return { approved: false, errors, warnings, reason: 'Account unavailable' };
    }

    const microCheck = this._validateMicroAccount(account);
    if (!microCheck.approved) {
      return microCheck;
    }

    const equity = account.equity || account.balance;

    if (this.dailyLoss <= config.account.maxDailyLoss * -1) {
      errors.push(`Daily loss limit reached: ${this.dailyLoss.toFixed(2)} (max: ${config.account.maxDailyLoss})`);
      return { approved: false, errors, warnings, reason: 'Daily loss limit' };
    }

    if (this.dailyTrades >= config.account.maxDailyTrades) {
      errors.push(`Daily trade limit reached: ${this.dailyTrades} (max: ${config.account.maxDailyTrades})`);
      return { approved: false, errors, warnings, reason: 'Daily trade limit' };
    }

    let positions = [];
    try {
      const posResult = await positionService.getOpenPositions();
      positions = Array.isArray(posResult) ? posResult : (posResult?.positions || []);
    } catch {
      warnings.push('Cannot retrieve open positions');
      positions = [];
    }

    const openTrades = positions.length;
    if (openTrades >= config.account.maxOpenTrades) {
      errors.push(`Max open trades reached: ${openTrades} (max: ${config.account.maxOpenTrades})`);
      return { approved: false, errors, warnings, reason: 'Max open trades' };
    }

    if (lot_size <= 0) {
      errors.push('Lot size must be positive');
      return { approved: false, errors, warnings, reason: 'Invalid lot size' };
    }

    if (config.risk.requireStopLoss && (stop_loss == null || stop_loss === 0)) {
      errors.push('Stop loss is required but not provided');
      return { approved: false, errors, warnings, reason: 'No stop loss' };
    }

    if (config.risk.requireTakeProfit && (take_profit == null || take_profit === 0)) {
      errors.push('Take profit is required but not provided');
      return { approved: false, errors, warnings, reason: 'No take profit' };
    }

    const riskAmount = Math.round(equity * (config.account.maxRiskPerTrade / 100) * 100) / 100;
    const signalRisk = Math.round((risk_amount || 0) * 100) / 100;
    if (signalRisk > riskAmount) {
      errors.push(`Risk amount ${signalRisk.toFixed(2)} exceeds max per trade ${riskAmount.toFixed(2)}`);
      return { approved: false, errors, warnings, reason: 'Risk amount exceeded' };
    }

    return {
      approved: true,
      errors,
      warnings,
      reason: warnings.length > 0 ? 'Approved with warnings' : 'All checks passed',
      account,
      positions,
    };
  }

  _validateMicroAccount(account) {
    const errors = [];
    const warnings = [];
    const expected = config.account || {};

    if (expected.expectedLogin != null && account.login != expected.expectedLogin) {
      errors.push(`Account login mismatch: ${account.login} != ${expected.expectedLogin}`);
    }
    if (expected.expectedServer && account.server !== expected.expectedServer) {
      errors.push(`Account server mismatch: ${account.server} != ${expected.expectedServer}`);
    }
    if (expected.expectedCurrency && account.currency !== expected.expectedCurrency) {
      warnings.push(`Account currency is ${account.currency}, expected ${expected.expectedCurrency}`);
    }
    if (expected.expectedBalance && account.balance != null) {
      const diff = Math.abs(account.balance - expected.expectedBalance);
      const tolerance = Math.max(expected.expectedBalance * 0.25, 2);
      if (diff > tolerance) {
        warnings.push(`Account balance ${account.balance} differs from expected ${expected.expectedBalance}`);
      }
    }
    if (account.margin_free < 0) {
      errors.push(`Insufficient free margin: ${account.margin_free}`);
    }

    return {
      approved: errors.length === 0,
      errors,
      warnings,
      reason: errors.length > 0 ? 'Micro account validation failed' : (warnings.length > 0 ? 'Approved with warnings' : 'Micro account OK'),
      account,
    };
  }
}

export const riskEngine = new RiskEngine();
export default RiskEngine;
