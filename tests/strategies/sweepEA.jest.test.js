/**
 * SweepEA strategy tests (M1 candle direction at a fixed daily time).
 */
import { jest } from '@jest/globals';

function makeMarketData(actualSymbol = 'US30.std') {
  return {
    available: true,
    actualSymbol,
    spec: {
      symbol: actualSymbol,
      bid: 100.5, ask: 100.7, spread: 0.2,
      digits: 2, point: 0.01, tick_size: 0.01, tick_value: 1, contract_size: 1,
      min_lot: 0.1, max_lot: 100, lot_step: 0.1,
      trade_mode: 4, stops_level: 0, freeze_level: 0,
    },
    history: {
      data: [
        { open: 99, close: 100, high: 100.5, low: 98.5, time: 1 },
        { open: 100, close: 101, high: 101.5, low: 99.5, time: 2 },
        { open: 101, close: 101.2, high: 101.5, low: 100.9, time: 3 },
      ],
    },
  };
}

async function loadStrategy(opts = {}) {
  jest.resetModules();
  const path = await import('path');
  const url = await import('url');
  const here = path.dirname(url.fileURLToPath(import.meta.url));
  const marketServiceAbs = path.resolve(here, '..', '..', 'services', 'marketService.js').replace(/\\/g, '/');
  const marketIntegrityAbs = path.resolve(here, '..', '..', 'services', 'marketIntegrity.js').replace(/\\/g, '/');
  const configAbs = path.resolve(here, '..', '..', 'config.js').replace(/\\/g, '/');
  jest.unstable_mockModule(marketServiceAbs, () => ({
    marketService: { getChartHistory: async () => opts.history, getSymbolInfo: async () => null, getTicksHistory: async () => null },
  }), { virtual: true });
  jest.unstable_mockModule(marketIntegrityAbs, () => ({
    runMarketIntegrityChecks: () => ({ approved: true, reason: 'ok', checks: [] }),
  }), { virtual: true });
  jest.unstable_mockModule(configAbs, () => ({
    default: { strategies: { sweepEA: opts.settings || {} } },
  }));
  return import('../../services/strategies/sweepEA.js');
}

describe('SweepEA strategy', () => {
  test('only US30 and US100 are allowed', async () => {
    const s = await loadStrategy();
    expect(s.allowedSymbols).toEqual(['US30', 'US100']);
  });

  test('returns null for unsupported symbol', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      expect(await s.scan('XAUUSD', makeMarketData())).toBeNull();
    });
  });

  test('returns null when no live price', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md = makeMarketData();
      md.spec.ask = null;
      md.spec.bid = null;
      expect(await s.scan('US30', md)).toBeNull();
    });
  });

  test('SELL opportunity: bearish closed candle', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md = makeMarketData();
      md.history.data[1] = { open: 102, close: 100, high: 102.5, low: 99.5, time: 2 };
      const opp = await s.scan('US30', md);
      expect(opp).toBeTruthy();
      expect(opp.direction).toBe('SELL');
      expect(opp.symbol).toBe('US30');
      expect(opp.stopLoss).toBeGreaterThan(opp.entry);
      expect(opp.takeProfit).toBeLessThan(opp.entry);
    });
  });

  test('BUY opportunity: bullish closed candle', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md = makeMarketData();
      md.history.data[1] = { open: 100, close: 103, high: 103.5, low: 99.5, time: 2 };
      const opp = await s.scan('US100', md);
      expect(opp).toBeTruthy();
      expect(opp.direction).toBe('BUY');
      expect(opp.stopLoss).toBeLessThan(opp.entry);
      expect(opp.takeProfit).toBeGreaterThan(opp.entry);
    });
  });

  test('one opportunity per (symbol, day)', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md = makeMarketData();
      const first = await s.scan('US30', md);
      const second = await s.scan('US30', md);
      expect(first).toBeTruthy();
      expect(second).toBeNull();
    });
  });

  test('BUY structure enforced: SL<Entry<TP', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md = makeMarketData();
      md.history.data[1] = { open: 100, close: 110, high: 110.5, low: 99.5, time: 2 };
      const opp = await s.scan('US30', md);
      expect(opp).toBeTruthy();
      expect(opp.stopLoss).toBeLessThan(opp.entry);
      expect(opp.takeProfit).toBeGreaterThan(opp.entry);
    });
  });

  test('US30 and US100 fire independently on the same day', async () => {
    const s = await loadStrategy();
    return withTime(new Date('2026-09-01T13:31:00Z'), async () => {
      s.resetDailyState();
      s.setNow(new Date('2026-09-01T13:31:00Z'));
      const md30 = makeMarketData('US30.std');
      md30.history.data[1] = { open: 100, close: 105, high: 105.5, low: 99.5, time: 2 };
      const md100 = makeMarketData('US100.std');
      md100.history.data[1] = { open: 18000, close: 17950, high: 18050, low: 17940, time: 2 };
      const a = await s.scan('US30', md30);
      const b = await s.scan('US100', md100);
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      expect(a.symbol).toBe('US30');
      expect(b.symbol).toBe('US100');
    });
  });
});

function withTime(_unused, fn) { return fn(); }
