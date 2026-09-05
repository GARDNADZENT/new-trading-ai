/**
 * Broker-agnostic instrument resolver tests.
 *
 * Stubs axios + tradeService so the resolver can be tested without the Python
 * bridge. Each test simulates a different broker's symbol list and asserts
 * the resolver picks the correct actual symbol from the catalog aliases.
 */

import { jest } from '@jest/globals';

const BROKERS = {
  DERIV: {
    XAUUSD: { symbol: 'XAUUSD', bid: 2400, ask: 2400.5, spread: 5, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 100, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Gold / US Dollar' },
    BTCUSD: { symbol: 'BTCUSD', bid: 60000, ask: 60050, spread: 50, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.01, volume_max: 10, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Bitcoin / US Dollar' },
    'US30': { symbol: 'US30', bid: 40000, ask: 40001, spread: 1, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.1, volume_max: 100, volume_step: 0.1, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Wall Street 30' },
  },
  JUSTMARKETS: {
    'XAUUSD.m': { symbol: 'XAUUSD.m', bid: 2400, ask: 2400.5, spread: 5, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 100, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Gold / US Dollar' },
    'BTCUSDm': { symbol: 'BTCUSDm', bid: 60000, ask: 60050, spread: 50, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.01, volume_max: 10, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Bitcoin / US Dollar' },
    'US30.std': { symbol: 'US30.std', bid: 40000, ask: 40001, spread: 1, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.1, volume_max: 100, volume_step: 0.1, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Dow Jones 30' },
    'US100.std': { symbol: 'US100.std', bid: 18000, ask: 18001, spread: 1, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.1, volume_max: 100, volume_step: 0.1, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Nasdaq 100' },
  },
  ICMARKETS: {
    'XAUUSD': { symbol: 'XAUUSD', bid: 2400, ask: 2400.5, spread: 5, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 100, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Gold / US Dollar' },
    'BTCUSD': { symbol: 'BTCUSD', bid: 60000, ask: 60050, spread: 50, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.01, volume_max: 10, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Bitcoin / US Dollar' },
    'US30Cash': { symbol: 'US30Cash', bid: 40000, ask: 40001, spread: 1, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.1, volume_max: 100, volume_step: 0.1, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'US 30 Cash' },
    'US100Cash': { symbol: 'US100Cash', bid: 18000, ask: 18001, spread: 1, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.1, volume_max: 100, volume_step: 0.1, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'US 100 Cash' },
  },
  EXNESS: {
    'XAUUSDm': { symbol: 'XAUUSDm', bid: 2400, ask: 2400.5, spread: 5, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 100, volume_min: 0.01, volume_max: 100, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Gold / US Dollar' },
    'BTCUSDm': { symbol: 'BTCUSDm', bid: 60000, ask: 60050, spread: 50, digits: 2, point: 0.01, trade_tick_size: 0.01, trade_tick_value: 1, trade_contract_size: 1, volume_min: 0.01, volume_max: 10, volume_step: 0.01, trade_stops_level: 0, trade_freeze_level: 0, trade_mode: 4, description: 'Bitcoin / US Dollar' },
  },
};

async function loadResolver(brokerKey) {
  jest.resetModules();
  const brokerSymbols = Object.values(BROKERS[brokerKey]);
  const brokerMap = new Map(Object.entries(BROKERS[brokerKey]));

  jest.unstable_mockModule('axios', () => ({
    default: {
      get: jest.fn(async (url) => {
        if (url.includes('/symbols')) {
          return { data: { count: brokerSymbols.length, symbols: brokerSymbols.map((s) => ({ symbol: s.symbol, description: s.description, visible: true, trade_mode: s.trade_mode, bid: s.bid, ask: s.ask, spread: s.spread })) } };
        }
        return { data: {} };
      }),
    },
  }));
  jest.unstable_mockModule('../services/tradeService.js', () => ({
    tradeService: {
      getSymbolInfo: async (symbol) => brokerMap.get(symbol) || null,
    },
  }));
  jest.unstable_mockModule('../config.js', () => ({
    default: {
      mt5Python: { url: 'http://x' },
      selectedPairs: [],
    },
  }));
  return import('../services/instrumentResolver.js');
}

describe('instrumentResolver', () => {
  test('Deriv: XAUUSD -> XAUUSD, BTCUSD -> BTCUSD, US30 -> US30', async () => {
    const r = await loadResolver('DERIV');
    for (const id of ['XAUUSD', 'BTCUSD', 'US30']) {
      const res = await r.resolveOne(id);
      expect(res).toBeTruthy();
      expect(res.actualSymbol).toBe(id);
      expect(res.source).toBe('direct');
    }
  });

  test('JustMarkets: XAUUSD -> XAUUSD.m, BTCUSD -> BTCUSDm, US30 -> US30.std, US100 -> US100.std', async () => {
    const r = await loadResolver('JUSTMARKETS');
    const cases = [
      ['XAUUSD', 'XAUUSD.m'],
      ['BTCUSD', 'BTCUSDm'],
      ['US30', 'US30.std'],
      ['US100', 'US100.std'],
    ];
    for (const [id, expected] of cases) {
      const res = await r.resolveOne(id);
      expect(res).toBeTruthy();
      expect(res.actualSymbol).toBe(expected);
    }
  });

  test('IC Markets: US30 -> US30Cash, US100 -> US100Cash', async () => {
    const r = await loadResolver('ICMARKETS');
    const us30 = await r.resolveOne('US30');
    const us100 = await r.resolveOne('US100');
    expect(us30.actualSymbol).toBe('US30Cash');
    expect(us100.actualSymbol).toBe('US100Cash');
  });

  test('Exness: XAUUSD -> XAUUSDm, BTCUSD -> BTCUSDm', async () => {
    const r = await loadResolver('EXNESS');
    expect((await r.resolveOne('XAUUSD')).actualSymbol).toBe('XAUUSDm');
    expect((await r.resolveOne('BTCUSD')).actualSymbol).toBe('BTCUSDm');
  });

  test('Unknown instrument returns null', async () => {
    const r = await loadResolver('DERIV');
    const res = await r.resolveOne('NOT_AN_INSTRUMENT');
    expect(res).toBeNull();
  });

  test('Instrument not on this broker: returns null + alternatives', async () => {
    const r = await loadResolver('EXNESS');
    const us30 = await r.resolveOne('US30');
    expect(us30).toBeNull();
    const snap = await r.getInstrumentSnapshot('US30');
    expect(snap.available).toBe(false);
    expect(Array.isArray(snap.alternatives)).toBe(true);
  });

  test('Catalog exposes all 4 asset classes (metal, crypto, index, energy)', async () => {
    const cat = await import('../services/instrumentCatalog.js');
    const all = cat.listInstruments();
    const classes = new Set(all.map((i) => i.assetClass));
    expect(classes.has('METAL')).toBe(true);
    expect(classes.has('CRYPTO')).toBe(true);
    expect(classes.has('INDEX')).toBe(true);
    expect(classes.has('ENERGY')).toBe(true);
  });

  test('pairManager shim returns catalog for getSupportedPairs', async () => {
    jest.resetModules();
    jest.unstable_mockModule('axios', () => ({ default: { get: jest.fn(async () => ({ data: { count: 0, symbols: [] } })) } }));
    jest.unstable_mockModule('../services/tradeService.js', () => ({ tradeService: { getSymbolInfo: async () => null } }));
    jest.unstable_mockModule('../config.js', () => ({ default: { mt5Python: { url: 'http://x' }, selectedPairs: [] } }));
    const pm = await import('../services/pairManager.js');
    const all = pm.getSupportedPairs();
    expect(all.XAUUSD).toBeTruthy();
    expect(all.BTCUSD).toBeTruthy();
    expect(all.US30).toBeTruthy();
    expect(all.USOIL).toBeTruthy();
  });
});
