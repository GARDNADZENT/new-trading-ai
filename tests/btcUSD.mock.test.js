import config from '../config.js';
import { tradePlanner } from '../services/tradePlanner.js';
import { newsClassifier } from '../services/newsClassifier.js';
import { runMarketIntegrityChecks } from '../services/marketIntegrity.js';
import { calculateTradeLevels, calculateLotSize, calculateRiskReward } from '../services/lotCalculator.js';
import { riskEngine } from '../services/riskEngine.js';
import { tradeLogger } from '../services/tradeLogger.js';
import { marketSession } from '../services/marketSession.js';
import eventBus from '../services/eventBus.js';
import { SIGNAL_EVENT } from '../services/eventBus.js';
import { analyzer } from '../services/analyzer.js';

const BTC_SPEC = {
  symbol: 'BTCUSD',
  bid: 59800,
  ask: 59850,
  spread: 50,
  digits: 2,
  point: 0.01,
  tick_size: 0.01,
  tick_value: 1,
  contract_size: 1,
  min_lot: 0.01,
  max_lot: 10,
  lot_step: 0.01,
  stops_level: 0,
  freeze_level: 0,
  trade_mode: 0,
  description: 'Bitcoin / US Dollar',
};

const syntheticCandles = Array.from({ length: 60 }, (_, i) => {
  const base = 60000 + Math.sin(i / 5) * 600;
  return { high: base + 300, low: base - 300, close: base };
});

describe('BTCUSD Mock Tests (offline)', () => {
  beforeEach(() => {
    tradeLogger.history = [];
    riskEngine.dailyLoss = 0;
    riskEngine.dailyTrades = 0;
    config.tradingMode.emergencyClose = false;
    config.tradingMode.paused = false;
    config.tradingMode.enabled = true;
    config.tradingMode.mode = 'AUTONOMOUS';
  });

  test('BTCUSD spec normalization', () => {
    expect(BTC_SPEC.symbol).toBe('BTCUSD');
    expect(BTC_SPEC.ask).toBeGreaterThan(BTC_SPEC.bid);
    expect(BTC_SPEC.contract_size).toBe(1);
    expect(BTC_SPEC.min_lot).toBeCloseTo(0.01);
  });

  test('BUY trade plan is valid', () => {
    const atr = 600;
    const plan = tradePlanner.planTrade({
      symbol: 'BTCUSD',
      direction: 'BUY',
      entry: BTC_SPEC.ask,
      spec: BTC_SPEC,
      atr,
      support: 59000,
      resistance: 61000,
      spread: BTC_SPEC.spread,
      volatility: 1,
      equity: 1000000,
      riskPercent: 1,
    });
    expect(plan.approved).toBe(true);
    expect(plan.stopLoss).toBeLessThan(plan.entry);
    expect(plan.entry).toBeLessThan(plan.takeProfit);
    expect(plan.riskReward).toBeGreaterThanOrEqual(2);
    expect(plan.lotSize).toBeGreaterThan(0);
  });

  test('SELL trade plan is valid', () => {
    const atr = 600;
    const plan = tradePlanner.planTrade({
      symbol: 'BTCUSD',
      direction: 'SELL',
      entry: BTC_SPEC.bid,
      spec: BTC_SPEC,
      atr,
      support: 59000,
      resistance: 61000,
      spread: BTC_SPEC.spread,
      volatility: 1,
      equity: 1000000,
      riskPercent: 1,
    });
    expect(plan.approved).toBe(true);
    expect(plan.takeProfit).toBeLessThan(plan.entry);
    expect(plan.entry).toBeLessThan(plan.stopLoss);
    expect(plan.riskReward).toBeGreaterThanOrEqual(2);
    expect(plan.lotSize).toBeGreaterThan(0);
  });

  test('newsClassifier marks USD NFP as relevant for BTCUSD', () => {
    const result = newsClassifier.classifyEvent(
      { currency: 'USD', category: 'NFP', impact: 'high', title: 'Non-Farm Payrolls' },
      'BTCUSD'
    );
    expect(result.impact).toBe('HIGH');
    expect(result.relevant).toBe(true);
  });

  test('newsClassifier marks irrelevant low-impact event as not relevant', () => {
    const result = newsClassifier.classifyEvent(
      { currency: 'AUD', category: 'CPI', impact: 'low', title: 'Aussie CPI' },
      'BTCUSD'
    );
    expect(result.relevant).toBe(false);
  });

  test('marketIntegrity rejects extreme volatility', () => {
    const result = runMarketIntegrityChecks({
      symbol: 'BTCUSD',
      spread: 1,
      volatility: 3,
      slippage: 0,
      priceValid: true,
      marketStatus: true,
      tradeMode: 1,
      account: { margin_free: 100 },
      lotSize: 0.01,
      spec: BTC_SPEC,
      direction: 'BUY',
      entry: BTC_SPEC.ask,
      stopLoss: BTC_SPEC.ask - 100,
      takeProfit: BTC_SPEC.ask + 200,
      openTrades: 0,
      maxOpenTrades: 3,
    });
    expect(result.approved).toBe(false);
    expect(result.checks.some(c => c.name === 'Volatility' && c.status === 'fail')).toBe(true);
  });

  test('marketIntegrity rejects duplicate event', () => {
    const result = runMarketIntegrityChecks({
      symbol: 'BTCUSD',
      spread: 1,
      volatility: 1,
      slippage: 0,
      priceValid: true,
      marketStatus: true,
      tradeMode: 1,
      account: { margin_free: 100 },
      lotSize: 0.01,
      spec: BTC_SPEC,
      direction: 'BUY',
      entry: BTC_SPEC.ask,
      stopLoss: BTC_SPEC.ask - 100,
      takeProfit: BTC_SPEC.ask + 200,
      openTrades: 0,
      maxOpenTrades: 3,
      duplicate: true,
    });
    expect(result.approved).toBe(false);
    expect(result.checks.some(c => c.name === 'Duplicate Protection' && c.status === 'fail')).toBe(true);
  });

  test('riskEngine kill switch blocks trades', async () => {
    config.tradingMode.emergencyClose = true;
    const result = await riskEngine.validateTrade({
      symbol: 'BTCUSD',
      lot_size: 0.01,
      stop_loss: BTC_SPEC.ask - 100,
      take_profit: BTC_SPEC.ask + 200,
      risk_reward: 2,
      dataStale: false,
    });
    expect(result.approved).toBe(false);
    expect(result.reason.toLowerCase()).toMatch(/emergency/);
  });

  test('weekend session allows crypto but blocks forex', () => {
    const saturday = new Date(Date.UTC(2026, 0, 3, 12, 0, 0));
    const monday = new Date(Date.UTC(2026, 0, 5, 12, 0, 0));
    expect(marketSession.isWeekend(saturday)).toBe(true);
    expect(marketSession.isWeekend(monday)).toBe(false);
    expect(marketSession.isPairTradeableNow('BTCUSD', saturday)).toBe(true);
    expect(marketSession.isPairTradeableNow('XAUUSD', saturday)).toBe(false);
    expect(marketSession.isPairTradeableNow('XAUUSD', monday)).toBe(true);
  });

  test('tradeLogger records BTC trades without mislabeling', () => {
    tradeLogger.logTrade({
      type: 'EXECUTION',
      symbol: 'BTCUSD',
      direction: 'BUY',
      lot_size: 0.01,
      entry: BTC_SPEC.ask,
      stop_loss: BTC_SPEC.ask - 100,
      take_profit: BTC_SPEC.ask + 200,
      ticket: 987654,
      risk_reward: 2,
      risk_amount: 0.1,
    });
    const btcTrades = tradeLogger.getTrades().filter(t => t.symbol === 'BTCUSD');
    const mislabeled = btcTrades.some(t => t.symbol === 'XAUUSD');
    expect(btcTrades.length).toBeGreaterThan(0);
    expect(mislabeled).toBe(false);
  });

  test('analyzer generates BUY signal for BTCUSD breakout above', () => {
    const event = {
      id: 'btc-breakout-1',
      title: 'BTCUSD Breakout',
      currency: 'USD',
      category: 'BTCUSD',
      impact: 'high',
      actual: 61000,
      forecast: 60000,
      previous: 59000,
      timestamp: Math.floor(Date.now() / 1000),
    };
    const result = analyzer.generateSignals(event);
    expect(result.error).toBeUndefined();
    expect(result.direction).toBe('above');
    const btcSignal = result.signals.find(s => s.pair === 'BTCUSD');
    expect(btcSignal).toBeDefined();
    expect(btcSignal.action).toBe('BUY');
  });

  test('minimum lot validation blocks micro accounts from BTCUSD', () => {
    const risk = tradePlanner.buildRiskReport({
      symbol: 'BTCUSD',
      spec: BTC_SPEC,
      account: { balance: 10, equity: 10, margin_free: 10 },
      riskPercent: 1,
      entry: BTC_SPEC.ask,
      stopLoss: BTC_SPEC.ask - 1500,
    });
    expect(risk.blocked).toBe(true);
    expect(risk.reason).toMatch(/minimum volume/i);
  });
});
