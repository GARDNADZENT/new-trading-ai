const HIGH_IMPACT = ['GDP', 'Interest Rate', 'Trade Balance', 'PMI', 'Employment'];

export function determineStrength(direction, category) {
  const strength = {};
  if (direction === 'above') {
    strength.AUD = 'Bullish';
    strength.USD = 'Bearish';
  } else if (direction === 'below') {
    strength.AUD = 'Bearish';
    strength.USD = 'Bullish';
  } else {
    strength.AUD = 'Neutral';
  }
  return strength;
}

export function getSignal(pair, direction, category, event) {
  const isBase = pair.startsWith('AUD');
  const isQuote = pair.endsWith('AUD');

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
