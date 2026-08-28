const HIGH_IMPACT = ['GDP', 'Interest Rate', 'CPI', 'PPI', 'PMI', 'FOMC'];

export function determineStrength(direction, category) {
  const strength = {};
  if (direction === 'above') {
    strength.JPY = 'Bullish';
    strength.USD = 'Bearish';
  } else if (direction === 'below') {
    strength.JPY = 'Bearish';
    strength.USD = 'Bullish';
  } else {
    strength.JPY = 'Neutral';
  }
  return strength;
}

export function getSignal(pair, direction, category, event) {
  const isBase = pair.startsWith('JPY');
  const isQuote = pair.endsWith('JPY');

  if (isBase && !isQuote) {
    if (direction === 'above') return { action: 'BUY', strength: sigStrength(category) };
    if (direction === 'below') return { action: 'SELL', strength: sigStrength(category) };
  }
  if (isQuote && !isBase) {
    if (direction === 'above') return { action: 'SELL', strength: sigStrength(category) };
    if (direction === 'below') return { action: 'BUY', strength: sigStrength(category) };
  }
  // USDJPY special: USD news drives it
  if (pair === 'USDJPY') {
    if (direction === 'above') return { action: 'BUY', strength: sigStrength(category) };
    if (direction === 'below') return { action: 'SELL', strength: sigStrength(category) };
  }
  return null;
}

function sigStrength(category) {
  return HIGH_IMPACT.includes(category) ? 4 : 3;
}

export default { determineStrength, getSignal };
