/**
 * Broker-agnostic instrument catalog.
 *
 * Each entry describes a TRADING CONCEPT (e.g. "GOLD vs USD") that maps to one
 * or more actual MT5 SYMBOL NAMES depending on the connected broker:
 *   - Deriv:         XAUUSD, US30 (Wall Street 30), US100 (US Tech 100)
 *   - JustMarkets:   XAUUSD.m, US30.std, US100.std
 *   - IC Markets:    XAUUSD, US30Cash, US100Cash
 *   - Exness:        XAUUSDm, US30, US100
 *   - Pepperstone:   XAUUSD, US30, US100
 *
 * The resolver (`services/instrumentResolver.js`) calls MT5 discovery to find
 * which alias actually exists on the connected account. No code outside this
 * file should hard-code a broker-specific symbol.
 */

export const INSTRUMENT_CATALOG = {
  // ---------- METALS ----------
  XAUUSD: {
    id: 'XAUUSD',
    label: 'Gold / US Dollar',
    icon: '🥇',
    assetClass: 'METAL',
    base: 'XAU',
    quote: 'USD',
    category: 'metals',
    keywords: ['XAU', 'GOLD'],
    aliases: [
      'XAUUSD', 'XAUUSDm', 'XAUUSD.m', 'XAUUSD.s', 'XAUUSD!', 'XAUUSD_',
      'XAUUSDecn', 'XAUUSDpro', 'Gold', 'GOLDUSD', 'GOLDu',
    ],
    tradeable: {
      cryptoWeekend: false,
      minVolumeHint: 0.01,
      contractHint: 100,
    },
  },
  XAGUSD: {
    id: 'XAGUSD',
    label: 'Silver / US Dollar',
    icon: '🥈',
    assetClass: 'METAL',
    base: 'XAG',
    quote: 'USD',
    category: 'metals',
    keywords: ['XAG', 'SILVER'],
    aliases: ['XAGUSD', 'XAGUSDm', 'XAGUSD.m', 'XAGUSD.s', 'XAGUSDecn', 'Silver', 'SILVERUSD'],
  },

  // ---------- FOREX ----------
  EURUSD: {
    id: 'EURUSD',
    label: 'Euro / US Dollar',
    icon: 'EUR',
    assetClass: 'FOREX',
    base: 'EUR',
    quote: 'USD',
    category: 'forex',
    keywords: ['EURUSD', 'EUR/USD', 'EURO DOLLAR'],
    aliases: ['EURUSD', 'EURUSDm', 'EURUSD.m', 'EURUSD.s', 'EURUSDecn'],
  },

  BTCUSD: {
    id: 'BTCUSD',
    label: 'Bitcoin / US Dollar',
    icon: 'BTC',
    assetClass: 'CRYPTO',
    base: 'BTC',
    quote: 'USD',
    category: 'crypto',
    keywords: ['BTC', 'BITCOIN'],
    aliases: ['BTCUSD', 'BTCUSDm', 'BTCUSD.m', 'BTCUSD.s', 'BTCUSDecn', 'Bitcoin'],
    tradeable: { cryptoWeekend: true, minVolumeHint: 0.01, contractHint: 1 },
  },

  // ---------- CRYPTO ----------
  ETHUSD: {
    id: 'ETHUSD',
    label: 'Ethereum / US Dollar',
    icon: 'Ξ',
    assetClass: 'CRYPTO',
    base: 'ETH',
    quote: 'USD',
    category: 'crypto',
    keywords: ['ETH', 'ETHEREUM'],
    aliases: ['ETHUSD', 'ETHUSDm', 'ETHUSD.m', 'Ethereum'],
    tradeable: { cryptoWeekend: true, minVolumeHint: 0.01, contractHint: 1 },
  },

  // ---------- INDICES (US) ----------
  US30: {
    id: 'US30',
    label: 'US 30 (Dow Jones)',
    icon: '🏛️',
    assetClass: 'INDEX',
    base: 'DJI',
    quote: 'USD',
    category: 'indices_us',
    keywords: ['US30', 'DJ30', 'DJI', 'DOW', 'WALLSTREET', 'WS30'],
    aliases: [
      'US30', 'US30.std', 'US30m', 'US30.s', 'US30Cash', 'US30.cash',
      'DJ30', 'DJ30.std', 'DJI30',
      'WallStreet30', 'WallStreet 30', 'WallStreet30m',
      'DowJones30', 'DowJones 30',
      'YM', 'YMm',
    ],
  },
  US100: {
    id: 'US100',
    label: 'US 100 (Nasdaq)',
    icon: '💻',
    assetClass: 'INDEX',
    base: 'NDX',
    quote: 'USD',
    category: 'indices_us',
    keywords: ['US100', 'NAS100', 'NDX', 'NASDAQ', 'TECH100'],
    aliases: [
      'US100', 'US100.std', 'US100m', 'US100.s', 'US100Cash', 'US100.cash',
      'NAS100', 'NAS100.std', 'NAS100m',
      'NDX100',
      'USTEC100', 'USTEC', 'USTECm',
      'NQ', 'NQm',
    ],
  },
  US500: {
    id: 'US500',
    label: 'US 500 (S&P)',
    icon: '🏦',
    assetClass: 'INDEX',
    base: 'SPX',
    quote: 'USD',
    category: 'indices_us',
    keywords: ['US500', 'SP500', 'SPX', 'S&P'],
    aliases: ['US500', 'US500.std', 'US500m', 'US500.s', 'US500Cash', 'SP500', 'SP500m', 'SPX500', 'SPX500m', 'ES', 'ESm'],
  },

  // ---------- INDICES (EU / Asia) ----------
  DE40: {
    id: 'DE40',
    label: 'Germany 40 (DAX)',
    icon: '🇩🇪',
    assetClass: 'INDEX',
    base: 'DAX',
    quote: 'EUR',
    category: 'indices_eu',
    keywords: ['DE40', 'DAX', 'GER40', 'GERMANY40'],
    aliases: ['DE40', 'DE40.std', 'DE40m', 'DAX40', 'DAX40.std', 'GER40', 'GER40.std', 'Germany40'],
  },
  UK100: {
    id: 'UK100',
    label: 'UK 100 (FTSE)',
    icon: '🇬🇧',
    assetClass: 'INDEX',
    base: 'UKX',
    quote: 'GBP',
    category: 'indices_eu',
    keywords: ['UK100', 'FTSE'],
    aliases: ['UK100', 'UK100.std', 'UK100m', 'FTSE100', 'FTSE100m'],
  },
  JP225: {
    id: 'JP225',
    label: 'Japan 225 (Nikkei)',
    icon: '🇯🇵',
    assetClass: 'INDEX',
    base: 'N225',
    quote: 'JPY',
    category: 'indices_asia',
    keywords: ['JP225', 'NIKKEI', 'JPN225'],
    aliases: ['JP225', 'JP225.std', 'JP225m', 'Nikkei225', 'N225'],
  },

  // ---------- OIL / ENERGY ----------
  USOIL: {
    id: 'USOIL',
    label: 'US Crude Oil',
    icon: '🛢️',
    assetClass: 'ENERGY',
    base: 'WTI',
    quote: 'USD',
    category: 'energy',
    keywords: ['USOIL', 'WTI', 'CRUDE', 'OIL'],
    aliases: ['USOIL', 'USOIL.std', 'USOILm', 'USOIL.s', 'WTI', 'WTIm', 'WTIUSD', 'CrudeOil', 'XTIUSD', 'XTIUSDm'],
  },
  UKOIL: {
    id: 'UKOIL',
    label: 'UK Brent Oil',
    icon: '🛢️',
    assetClass: 'ENERGY',
    base: 'BRENT',
    quote: 'USD',
    category: 'energy',
    keywords: ['UKOIL', 'BRENT'],
    aliases: ['UKOIL', 'UKOIL.std', 'UKOILm', 'BRENT', 'BRENTm', 'XBRUSD', 'XBRUSDm'],
  },
};

const STANDARD_FOREX_PAIRS = [
  'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY',
];

for (const id of STANDARD_FOREX_PAIRS) {
  if (INSTRUMENT_CATALOG[id]) continue;
  INSTRUMENT_CATALOG[id] = {
    id,
    label: `${id.slice(0, 3)} / ${id.slice(3)}`,
    icon: id,
    assetClass: 'FOREX',
    base: id.slice(0, 3),
    quote: id.slice(3),
    category: 'forex',
    keywords: [id, `${id.slice(0, 3)}/${id.slice(3)}`],
    aliases: [id, `${id}m`, `${id}.m`, `${id}.s`, `${id}ecn`, `${id}pro`],
  };
}

export const CATALOG_BY_ID = INSTRUMENT_CATALOG;

export function listInstruments() {
  return Object.values(INSTRUMENT_CATALOG);
}

export function getInstrument(id) {
  return INSTRUMENT_CATALOG[id] || null;
}

export function getAliases(id) {
  return INSTRUMENT_CATALOG[id]?.aliases || [id];
}

export function getKeywords(id) {
  return INSTRUMENT_CATALOG[id]?.keywords || [];
}

export default { INSTRUMENT_CATALOG, listInstruments, getInstrument, getAliases, getKeywords };
