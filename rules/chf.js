const HIGH_IMPACT = ['Interest Rate', 'GDP', 'CPI', 'PPI', 'PMI'];

export function determineStrength(direction, category) {
  const strength = {};
  if (direction === 'above') {
    strength.CHF = 'Bullish';
    strength.USD = 'Bearish';
  } else if (direction === 'below') {
    strength.CHF = 'Bearish';
    strength.USD = 'Bullish';
  } else {
    strength.CHF = 'Neutral';
  }
  return strength;
}

export function getSignal(pair, direction, category, event) {
  const isBase = pair.startsWith('CHF');
  const isQuote = pair.endsWith('CHF');

  if (isBase && !isQuote) {
    if (direction === 'above') return { action: 'BUY', strength: sigStrength(category) };
    if (direction === 'below') return { action: 'SELL', strength: sigStrength(category) };
  }
  if (isQuote && !isBase) {
    if (direction === 'above') return { action: 'SELL', strength: sigStrength(category) };
    if (direction === 'below') return { action: 'BUY', strength: sigStrength(category) };
  }
  return null;
}

function sigStrength(category) {
  return HIGH_IMPACT.includes(category) ? 4 : 3;
}

export default { determineStrength, getSignal };
