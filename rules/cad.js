const HIGH_IMPACT = ['Interest Rate', 'GDP', 'Trade Balance', 'PMI', 'Employment'];

export function determineStrength(direction, category) {
  const strength = {};
  if (direction === 'above') {
    strength.CAD = 'Bullish';
  } else if (direction === 'below') {
    strength.CAD = 'Bearish';
  } else {
    strength.CAD = 'Neutral';
  }
  return strength;
}

export function getSignal(pair, direction, category, event) {
  const isBase = pair.startsWith('CAD');
  const isQuote = pair.endsWith('CAD');

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
