import config from '../config.js';

const HIGH_IMPACT_CATEGORIES = [
  'NFP',
  'Non-Farm Payrolls',
  'GDP',
  'PPI',
  'PCE',
  'FOMC',
  'Interest Rate',
  'CPI',
];

const BULLISH_FOR_USD = [
  'NFP',
  'Non-Farm Payrolls',
  'GDP',
  'Jobless Claims',
  'Retail Sales',
  'Average Hourly Earnings',
  'PPI',
  'PCE',
  'PMI',
  'FOMC',
  'Interest Rate',
  'Oil Inventories',
  'Trade Balance',
  'Services PMI',
  'Manufacturing PMI',
];

const BEARISH_FOR_USD = [
  'Unemployment Rate',
  'CPI',
  'Jobless Claims',
];

export function determineStrength(direction, category) {
  const strength = {};

  if (direction === 'above') {
    strength.USD = BULLISH_FOR_USD.includes(category) ? 'Bullish' : 'Bullish';
    strength.XAU = 'Bearish';
    strength.CAD = 'Bearish';
    strength.AUD = 'Bearish';
    strength.NZD = 'Bearish';
    strength.EUR = 'Bearish';
    strength.GBP = 'Bearish';
  } else if (direction === 'below') {
    strength.USD = BEARISH_FOR_USD.includes(category) ? 'Bearish' : 'Bearish';
    strength.XAU = 'Bullish';
    strength.CAD = 'Bullish';
    strength.AUD = 'Bullish';
    strength.NZD = 'Bullish';
    strength.EUR = 'Bullish';
    strength.GBP = 'Bullish';
  } else {
    strength.USD = 'Neutral';
  }
  return strength;
}

export function getSignal(pair, direction, category, event) {
  const hasUsd = pair.includes('USD');

  if (hasUsd) {
    const isBase = pair.startsWith('USD');
    const isQuote = pair.endsWith('USD');

    if (direction === 'above') {
      if (isBase && !isQuote) return { action: 'BUY', strength: strengthFor(pair, category) };
      if (isQuote && !isBase) return { action: 'SELL', strength: strengthFor(pair, category) };
      if (!isBase && !isQuote) {
        return { action: 'BUY', strength: strengthFor(pair, category) };
      }
    } else if (direction === 'below') {
      if (isBase && !isQuote) return { action: 'SELL', strength: strengthFor(pair, category) };
      if (isQuote && !isBase) return { action: 'BUY', strength: strengthFor(pair, category) };
      if (!isBase && !isQuote) {
        return { action: 'SELL', strength: strengthFor(pair, category) };
      }
    }
  }

  if (pair === 'XAUUSD' || pair === 'XAGUSD') {
    if (direction === 'above') return { action: 'SELL', strength: strengthFor(pair, category) };
    if (direction === 'below') return { action: 'BUY', strength: strengthFor(pair, category, false) };
  }

  return null;
}

function strengthFor(pair, category, strong = true) {
  const base = HIGH_IMPACT_CATEGORIES.includes(category) ? 4 : 3;
  return strong ? base + 1 : base;
}

export default { determineStrength, getSignal };
