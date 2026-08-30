const HIGH_IMPACT_CATEGORIES = ['NFP', 'Non-Farm Payrolls', 'GDP', 'PPI', 'PCE', 'FOMC', 'Interest Rate', 'CPI', 'BTCUSD'];
const MEDIUM_IMPACT_CATEGORIES = ['PMI', 'Jobless Claims', 'Retail Sales', 'Average Hourly Earnings', 'Consumer Confidence', 'Trade Balance'];
const CRYPTO_RELATED = ['BTCUSD', 'Bitcoin', 'Crypto', 'CRYPTO'];

function classifyImpact(event) {
  const impact = String(event?.impact || '').toLowerCase();
  if (impact === 'high') return 'HIGH';
  if (impact === 'medium' || impact === 'moderate') return 'MEDIUM';
  if (impact === 'low') return 'LOW';
  const category = event?.category || '';
  if (HIGH_IMPACT_CATEGORIES.includes(category)) return 'HIGH';
  if (MEDIUM_IMPACT_CATEGORIES.includes(category)) return 'MEDIUM';
  return 'LOW';
}

function isRelevantToBtc(event) {
  const currency = String(event?.currency || '').toUpperCase();
  const category = String(event?.category || '');
  const title = String(event?.title || '').toLowerCase();

  if (CRYPTO_RELATED.some((c) => category.includes(c) || title.includes(c.toLowerCase()))) {
    return { relevant: true, reason: 'Crypto-specific event' };
  }
  if (currency === 'USD') {
    return { relevant: true, reason: 'Major USD event can move BTCUSD' };
  }
  return { relevant: false, reason: 'No clear link to BTCUSD' };
}

export function classifyEvent(event, pair = 'BTCUSD') {
  const impact = classifyImpact(event);
  if (pair === 'BTCUSD') {
    const rel = isRelevantToBtc(event);
    return { impact, relevant: rel.relevant, reason: rel.reason };
  }
  const rel = { relevant: String(event?.currency || '').toUpperCase() === 'USD', reason: 'USD event' };
  return { impact, relevant: rel.relevant, reason: rel.reason };
}

export function shouldTradeBtcOnEvent(event) {
  const { impact, relevant } = classifyEvent(event, 'BTCUSD');
  return impact === 'HIGH' && relevant;
}

export const newsClassifier = { classifyEvent, shouldTradeBtcOnEvent, classifyImpact };

export default newsClassifier;
