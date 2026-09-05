const HIGH_IMPACT_CATEGORIES = ['NFP', 'Non-Farm Payrolls', 'GDP', 'PPI', 'PCE', 'FOMC', 'Interest Rate', 'CPI'];
const MEDIUM_IMPACT_CATEGORIES = ['PMI', 'Jobless Claims', 'Retail Sales', 'Average Hourly Earnings', 'Consumer Confidence', 'Trade Balance'];

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

export function classifyEvent(event, pair) {
  const impact = classifyImpact(event);
  const rel = { relevant: String(event?.currency || '').toUpperCase() === 'USD', reason: 'USD event' };
  return { impact, relevant: rel.relevant, reason: rel.reason };
}

export const newsClassifier = { classifyEvent, classifyImpact };

export default newsClassifier;
