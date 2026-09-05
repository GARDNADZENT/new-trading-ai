const socket = io();
const state = {
  upcoming: [],
  today: [],
  historical: [],
  signals: [],
  history: [],
  performance: [],
  tradePlan: null,
  settings: {},
  mt5: {
    account: null,
    market: [],
    positions: [],
    status: null,
    trades: [],
  },
  trading: {
    mode: null,
    enabled: false,
    paused: false,
    emergencyClose: false,
  },
};

/* ---- Status ---- */
function updateStatus(online) {
  const dot = document.getElementById('statusDot');
  const text = document.getElementById('statusText');
  if (online) {
    dot.className = 'status-dot online';
    text.textContent = 'Live';
  } else {
    dot.className = 'status-dot offline';
    text.textContent = 'Offline';
  }
}

/* ---- Tab Navigation ---- */
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

/* ---- Render Events ---- */
function renderEvents() {
  const list = document.getElementById('eventsList');
  const now = Date.now() / 1000;

  const renderSection = (title, events, isPast = false) => {
    if (!events.length) return '';
    return `
      <div class="events-section">
        <h3 class="events-section-title">${title}</h3>
        ${events.map(ev => renderEventCard(ev, isPast)).join('')}
      </div>
    `;
  };

  let html = '';
  html += renderSection('⏩ Upcoming', state.upcoming, false);
  html += renderSection('📅 Today', state.today, false);
  html += renderSection('📜 Historical', state.historical, true);

  list.innerHTML = html || '<div class="empty-state">No events found.</div>';
}

function renderEventCard(ev, isPast) {
  const dt = new Date(ev.timestamp * 1000);
  const now = Date.now() / 1000;
  const isPastEvt = ev.timestamp < now;
  const impact = (ev.impact || 'medium').toLowerCase();
  const actualHtml = (isPastEvt && ev.actual)
    ? `<span style="color: var(--green); font-weight: 600;">Actual: ${ev.actual}</span>`
    : '<span style="color: var(--text-secondary);">Pending</span>';

  const nairobiTime = dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' });
  const nairobiDate = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Africa/Nairobi' });

  const pairBadges = (ev.pairs && ev.pairs.length > 0)
    ? `<div class="pair-badges">${ev.pairs.slice(0, 8).map(p => {
        const belowColor = p.below === 'BUY' ? 'var(--green)' : 'var(--red)';
        const aboveColor = p.above === 'SELL' ? 'var(--red)' : 'var(--green)';
        return `<span class="pair-badge" title="${p.pair}: Above=${p.above}, Below=${p.below}">${p.pair} <span style="color:${belowColor}">↓${p.below}</span> <span style="color:${aboveColor}">↑${p.above}</span></span>`;
      }).join('')}</div>`
    : '';

  return `
    <div class="event-card ${isPastEvt ? 'event-card--past' : ''}">
      <div class="event-main">
        <span class="event-title">${ev.title || ev.name || 'Untitled'}</span>
        <div class="event-meta">
          <span class="event-time" data-tz="Africa/Nairobi">${nairobiDate} ${nairobiTime} EAT</span>
          <span>${ev.currency || ''}</span>
          <span class="impact-badge impact-${impact}">${impact}</span>
          <span>Forecast: ${ev.forecast || '-'}</span>
          <span>Previous: ${ev.previous || '-'}</span>
        </div>
        ${pairBadges}
      </div>
      <div class="event-actual">
        ${actualHtml}
      </div>
    </div>
  `;
}

/* ---- Render Signals ---- */
function renderSignals() {
  const feed = document.getElementById('signalsFeed');
  if (!state.signals.length) {
    feed.innerHTML = '<div class="empty-state">No signals yet. Waiting for news releases...</div>';
    return;
  }
  feed.innerHTML = state.signals.map(sig => renderSignalCard(sig)).join('');
}

function renderSignalCard(r) {
  const direction = r.direction === 'above' ? 'Above Forecast → ' : r.direction === 'below' ? 'Below Forecast → ' : 'Equal';
  const currencyItems = Object.entries(r.currencyStrength || {}).map(([cur, str]) => {
    const cls = str.toLowerCase();
    return `<span class="strength-badge ${cls}">${cur} ${str}</span>`;
  }).join('');

  const signalPills = (r.signals || []).map(s => {
    const actionClass = s.action.toLowerCase();
    const stars = '⭐'.repeat(s.strength);
    return `
      <div class="signal-pill">
        <span class="pair">${s.pair}</span>
        <span class="action ${actionClass}">${s.action}</span>
        <span class="stars">${stars}</span>
      </div>
    `;
  }).join('');

  const dateStr = r.event?.date || '';
  const reasonText = buildReasonText(r);

  return `
    <div class="signal-card ${r.direction === 'above' ? 'buy' : r.direction === 'below' ? 'sell' : ''}">
      <div class="signal-header">
        <span class="signal-title">${r.event?.title || 'Unknown Event'}</span>
        <span class="event-time">${dateStr}</span>
      </div>
      <div class="signal-meta">
        <span>Forecast: <span class="value">${r.data?.forecast || 'N/A'}</span></span>
        <span>Actual: <span class="value" style="color: ${r.direction === 'above' ? 'var(--green)' : r.direction === 'below' ? 'var(--red)' : 'var(--text)'}">${r.data?.actual || 'N/A'}</span></span>
        <span>Previous: <span class="value">${r.data?.previous || 'N/A'}</span></span>
      </div>
      <div class="currency-strength">${currencyItems}</div>
      <div class="signals-grid">${signalPills}</div>
      <div class="signal-footer">
        <div class="confidence-bar">
          <span class="decision-check">News direction ✓</span>
          <span class="decision-check">Rules evaluated ✓</span>
        </div>
        <div class="reason-text">${reasonText}</div>
      </div>
    </div>
  `;
}

function buildReasonText(r) {
  const reasons = {
    NFP: 'Employment', 'Non-Farm Payrolls': 'Employment', CPI: 'Inflation',
    PPI: 'Producer Prices', 'Jobless Claims': 'Labor Market',
    'Retail Sales': 'Consumer Spending', 'Average Hourly Earnings': 'Wage Growth',
    'Unemployment Rate': 'Labor Market', GDP: 'Economic Growth',
    PMI: 'Sector Activity', 'Services PMI': 'Services',
    'Manufacturing PMI': 'Manufacturing', FOMC: 'Monetary Policy',
    'Interest Rate': 'Rate Decision', PCE: 'Inflation',
    'Oil Inventories': 'Supply/Demand', 'Trade Balance': 'Trade Flows',
    'Consumer Confidence': 'Sentiment',
  };
  const reason = reasons[r.event?.category] || 'Economic Data';
  const dir = r.direction === 'below' ? '↓' : r.direction === 'above' ? '↑' : '=';
  const usdStr = r.currencyStrength?.USD || 'Neutral';
  return `${reason} ${dir} | USD: ${usdStr} | Holding: ${r.optimalHoldingTime}m`;
}

/* ---- Render History ---- */
function renderHistory() {
  const body = document.getElementById('historyBody');
  const count = document.getElementById('historyCount');
  count.textContent = `${state.history.length} records`;

  if (!state.history.length) {
    body.innerHTML = '<tr><td colspan="8" class="empty-state">No history available.</td></tr>';
    return;
  }

  body.innerHTML = state.history.slice().reverse().map(r => {
    const dir = r.direction;
    const confClass = r.confidence >= 80 ? 'high' : r.confidence >= 60 ? 'medium' : 'low';
    return `
      <tr>
        <td>${r.event?.date || ''}</td>
        <td>${r.event?.title || ''}</td>
        <td class="numeric">${r.data?.forecast || 'N/A'}</td>
        <td class="numeric" style="color: ${dir === 'above' ? 'var(--green)' : dir === 'below' ? 'var(--red)' : 'var(--text)'}">${r.data?.actual || 'N/A'}</td>
        <td class="numeric">${r.data?.previous || 'N/A'}</td>
        <td><span class="direction-badge ${dir}">${dir}</span></td>
        <td class="numeric ${confClass}" style="color: ${r.confidence >= 80 ? 'var(--green)' : r.confidence >= 60 ? 'var(--yellow)' : 'var(--red)'}">${r.confidence}%</td>
        <td>${r.optimalHoldingTime}m</td>
      </tr>
    `;
  }).join('');
}

/* ---- Render Performance ---- */
function renderPerformance() {
  const grid = document.getElementById('performanceGrid');
  if (!state.performance.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">No performance data yet.</div>';
    return;
  }
  grid.innerHTML = state.performance.map(p => {
    const confClass = p.avgConfidence >= 80 ? 'high' : p.avgConfidence >= 60 ? 'medium' : 'low';
    return `
      <div class="perf-card">
        <div class="perf-category">${p.category}</div>
        <div class="perf-confidence ${confClass}">${p.avgConfidence}%</div>
        <div class="perf-samples">${p.sampleSize} samples</div>
        <div class="perf-holding">Best: ${p.bestHoldingTime}m</div>
      </div>
    `;
  }).join('');
}

/* ---- Render Settings ---- */
function renderSettings() {
  if (state.settings.riskPercent) {
    const el = document.getElementById('riskPercent');
    if (el) el.value = state.settings.riskPercent;
  }
  if (state.settings.ocoEnabled !== undefined) {
    const el = document.getElementById('ocoEnabled');
    if (el) el.value = state.settings.ocoEnabled ? 'true' : 'false';
  }
  if (state.settings.maxOpenTrades) {
    const el = document.getElementById('maxOpenTrades');
    if (el) el.value = state.settings.maxOpenTrades;
  }
  if (state.settings.dailyLossLimit) {
    const el = document.getElementById('dailyLossLimit');
    if (el) el.value = state.settings.dailyLossLimit;
  }
}

/* ---- Toast ---- */
function showToast(title, msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-msg">${msg}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

/* ---- Scanner ---- */
async function refreshScanner() {
  try {
    const res = await fetch('/api/opportunities');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderScanner(data);
  } catch (err) {
    console.error('refreshScanner failed', err.message);
  }
}

function renderScanner(data) {
  const list = document.getElementById('opportunitiesList');
  const regimeEl = document.getElementById('scannerRegime');
  const countEl = document.getElementById('scannerOppCount');
  const bestEl = document.getElementById('scannerBest');

  if (!list) return;

  const opportunities = data?.opportunities || [];
  const best = data?.best;

  if (regimeEl) regimeEl.textContent = best?.marketRegime || '--';
  if (countEl) countEl.textContent = String(opportunities.length);
  if (bestEl) bestEl.textContent = best ? `${best.strategy} ${best.direction}` : '--';

  if (!opportunities.length) {
    list.innerHTML = '<div class="empty-state">Scanning for opportunities...</div>';
    return;
  }

  list.innerHTML = opportunities.map(opp => {
    const scoreClass = opp.score >= 80 ? 'score--high' : opp.score >= 60 ? 'score--medium' : 'score--low';
    const dirClass = opp.direction.toLowerCase();
    return `
      <div class="opportunity-card opportunity-card--${dirClass}">
        <div class="opportunity-header">
          <span class="opportunity-symbol">${escapeHtml(opp.symbol)}</span>
          <span class="opportunity-strategy">${escapeHtml(opp.strategy)}</span>
          <span class="opportunity-score ${scoreClass}">${opp.score}/100</span>
        </div>
        <div class="opportunity-body">
          <span class="direction-badge ${dirClass}">${opp.direction}</span>
          <span class="opportunity-regime">${escapeHtml(opp.marketRegime || '--')}</span>
          <span class="opportunity-timeframe">${escapeHtml(opp.timeframe || '--')}</span>
        </div>
        <div class="opportunity-footer">
          <span>Entry: ${fmtNum(opp.entry, 5)}</span>
          <span>SL: ${fmtNum(opp.stopLoss, 5)}</span>
          <span>TP: ${fmtNum(opp.takeProfit, 5)}</span>
        </div>
        <div class="opportunity-reason">${escapeHtml(opp.reason || '')}</div>
      </div>
    `;
  }).join('');
}

/* ---- MT5 Dashboard ---- */
function renderMt5Dashboard() {
  renderIntelligenceStrip();
  renderTradePlanCard();
  renderMt5Account();
  renderMt5Positions();
  renderMt5Status();
  renderExecutionMonitor();
}

function renderIntelligenceStrip() {
  const eventCard = document.getElementById('nextEventCard');
  const accountCard = document.getElementById('accountProtectionCard');
  const decisionCard = document.getElementById('decisionCard');
  if (!eventCard || !accountCard || !decisionCard) return;

  const event = state.upcoming.find(item => ['high', 'medium'].includes(String(item.impact || '').toLowerCase())) || state.upcoming[0];
  if (event) {
    const remaining = Math.max(0, Math.floor(event.timestamp - Date.now() / 1000));
    const countdown = `${String(Math.floor(remaining / 3600)).padStart(2, '0')}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
    const impact = String(event.impact || 'medium').toUpperCase();
    eventCard.innerHTML = `<span class="intel-label">Next ${impact.toLowerCase()} event</span><strong>${escapeHtml(event.title || event.eventName || 'Economic event')}</strong><span class="intel-value"><b class="impact-text impact-text--${impact.toLowerCase()}">${escapeHtml(impact)}</b> ${escapeHtml(event.currency || '-')} <b>${countdown}</b></span>`;
  }

  const account = state.mt5.account?.account || state.mt5.account;
  if (account) {
    const open = state.mt5.positions?.length || 0;
    accountCard.innerHTML = `<span class="intel-label">Account protection</span><strong>${fmtNum(account.balance)}</strong><span class="intel-value">Equity ${fmtNum(account.equity)} | Open trades ${open}</span>`;
  }

  const latest = state.mt5.trades?.[0];
  if (latest) {
    const type = latest.type === 'EXECUTION' && latest.success ? 'TRADE EXECUTED' : latest.type === 'FAILED' || latest.type === 'REJECTED' || latest.type === 'NO_TRADE' ? 'NO TRADE' : latest.type;
    const detail = latest.error || latest.reason || (latest.ticket ? `Ticket ${latest.ticket}` : 'Decision recorded');
    decisionCard.innerHTML = `<span class="intel-label">Latest decision</span><strong>${escapeHtml(type)}</strong><span class="intel-value">${escapeHtml(detail)}</span>`;
  }
}

function renderDashboardAccount() {
  const card = document.getElementById('dashboardAccountCard');
  if (!card) return;
  const account = state.mt5.account?.account || state.mt5.account;
  const positions = state.mt5.positions?.length || 0;
  const items = [
    { label: 'Login', value: account?.login || account?.account || '-' },
    { label: 'Server', value: account?.server || '-' },
    { label: 'Balance', value: account?.balance != null ? fmtNum(account.balance) : '-' },
    { label: 'Equity', value: account?.equity != null ? fmtNum(account.equity) : '-' },
    { label: 'Free Margin', value: fmtNum(account?.margin_free || account?.free_margin) },
    { label: 'Margin', value: fmtNum(account?.margin) },
    { label: 'Margin Level', value: account?.margin_level != null ? `${fmtNum(account.margin_level)}%` : '-' },
    { label: 'Leverage', value: account?.leverage != null ? `1:${account.leverage}` : '-' },
    { label: 'Currency', value: account?.currency || '-' },
    { label: 'Name', value: account?.name || '-' },
    { label: 'Company', value: account?.company || '-' },
    { label: 'Positions', value: positions }
  ];
  card.innerHTML = `<h3>Account</h3><div class="mt5-kv">${items.map(i => `<div class="mt5-k"><span>${i.label}</span><span>${i.value}</span></div>`).join('')}</div>`;
}

function resolveTradePlanSnapshot() {
  const tradeCandidates = [
    ...(state.mt5.trades || []).filter(item => item && (item.entry != null || item.stop_loss != null || item.take_profit != null)),
    ...(state.signals || []).filter(item => item && (item.entry != null || item.stop_loss != null || item.take_profit != null)),
  ];

  if (!tradeCandidates.length) return null;

  const candidate = tradeCandidates[0];
  const direction = candidate.direction || (candidate.type === 'EXECUTION' ? (candidate.success ? 'BUY' : 'SELL') : 'BUY');
  const entry = candidate.entry ?? candidate.entry_price ?? candidate.entryPrice ?? null;
  const stopLoss = candidate.stop_loss ?? candidate.sl ?? candidate.stopLoss ?? null;
  const takeProfit = candidate.take_profit ?? candidate.tp ?? candidate.takeProfit ?? null;
  const atr = candidate.atr ?? candidate.atrValue ?? null;
  const riskAmount = candidate.risk_amount ?? null;
  const riskReward = candidate.risk_reward ?? null;
  const reason = candidate.reason || candidate.error || 'Trade plan pending validation';

  const status = candidate.type === 'REJECTED' || /reject|below minimum|invalid|too low|requires/i.test(String(reason))
    ? 'rejected'
    : candidate.type === 'EXECUTION' || candidate.success || /approved|all checks passed|trade plan approved/i.test(String(reason))
      ? 'approved'
      : 'pending';

  const structureValid = direction === 'BUY'
    ? (stopLoss != null && takeProfit != null && entry != null && stopLoss < entry && takeProfit > entry)
    : (stopLoss != null && takeProfit != null && entry != null && stopLoss > entry && takeProfit < entry);

  const estimatedReward = entry != null && takeProfit != null ? Math.abs(takeProfit - entry) : null;
  const estimatedRisk = entry != null && stopLoss != null ? Math.abs(entry - stopLoss) : null;

  return {
    direction,
    entry,
    stopLoss,
    takeProfit,
    atr,
    riskAmount,
    riskReward: riskReward ?? (estimatedReward != null && estimatedRisk ? (estimatedReward / estimatedRisk) : null),
    structure: structureValid ? 'Valid structure' : 'Structure check failed',
    status,
    reason,
    risk: riskAmount ?? (estimatedRisk != null ? `${fmtNum(estimatedRisk, 2)}` : 'N/A'),
    reward: estimatedReward != null ? `${fmtNum(estimatedReward, 2)}` : 'N/A',
    signalLabel: candidate.symbol || candidate.eventId || 'Trade plan',
  };
}

function renderTradePlanCard() {
  const card = document.getElementById('tradePlanCard');
  if (!card) return;

  const plan = resolveTradePlanSnapshot();
  if (!plan) {
    card.innerHTML = '<div class="mt5-empty">No trade plan available yet.</div>';
    return;
  }

  const title = plan.direction === 'SELL' ? 'SELL plan' : plan.direction === 'BUY' ? 'BUY plan' : 'Trade plan';
  const statusClass = `trade-plan-status--${plan.status}`;
  const labelMap = {
    approved: 'Approved',
    rejected: 'Rejected',
    pending: 'Pending',
  };

  const atrValue = plan.atr != null ? fmtNum(plan.atr, 4) : 'N/A';
  const reasonText = escapeHtml(plan.reason || 'No reason provided');

  card.innerHTML = `
    <div class="trade-plan-card__header">
      <div class="trade-plan-card__title">${escapeHtml(title)} · ${escapeHtml(plan.signalLabel)}</div>
      <span class="trade-plan-status ${statusClass}">${labelMap[plan.status] || 'Pending'}</span>
    </div>
    <div class="trade-plan-grid">
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">Entry</span>
        <span class="trade-plan-metric__value">${plan.entry != null ? fmtNum(plan.entry, 5) : 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">SL</span>
        <span class="trade-plan-metric__value trade-plan-metric__value--danger">${plan.stopLoss != null ? fmtNum(plan.stopLoss, 5) : 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">TP</span>
        <span class="trade-plan-metric__value trade-plan-metric__value--success">${plan.takeProfit != null ? fmtNum(plan.takeProfit, 5) : 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">Risk</span>
        <span class="trade-plan-metric__value trade-plan-metric__value--danger">${plan.risk || 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">Reward</span>
        <span class="trade-plan-metric__value trade-plan-metric__value--success">${plan.reward || 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">R:R</span>
        <span class="trade-plan-metric__value ${plan.riskReward != null && plan.riskReward >= 2 ? 'trade-plan-metric__value--success' : 'trade-plan-metric__value--warning'}">${plan.riskReward != null ? fmtNum(plan.riskReward, 2) : 'N/A'}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">ATR</span>
        <span class="trade-plan-metric__value">${atrValue}</span>
      </div>
      <div class="trade-plan-metric">
        <span class="trade-plan-metric__label">Market structure</span>
        <span class="trade-plan-metric__value ${plan.structure === 'Valid structure' ? 'trade-plan-metric__value--success' : 'trade-plan-metric__value--warning'}">${escapeHtml(plan.structure || 'N/A')}</span>
      </div>
    </div>
    <div class="trade-plan-card__reason"><strong>Approval / rejection reason:</strong> ${reasonText}</div>
    <div class="trade-plan-card__meta">
      <span>Direction: ${escapeHtml(plan.direction || 'N/A')}</span>
      <span>Risk amount: ${plan.riskAmount != null ? fmtNum(plan.riskAmount, 2) : 'N/A'}</span>
      <span>Structure: ${escapeHtml(plan.structure || 'N/A')}</span>
    </div>
  `;
}

function renderExecutionMonitor() {
  const next = document.getElementById('monitorNext');
  const summary = document.getElementById('monitorSummary');
  const timeline = document.getElementById('tradeTimeline');
  if (!summary || !timeline) return;

  const nextEvent = state.upcoming[0];
  if (next) {
    if (!nextEvent) {
      next.textContent = 'No upcoming event loaded.';
    } else {
      const remaining = Math.max(0, Math.floor(nextEvent.timestamp - Date.now() / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, '0');
      next.textContent = `Next: ${nextEvent.title || nextEvent.eventName || 'Event'} | ${nextEvent.currency || '-'} ${nextEvent.impact || '-'} | in ${minutes}:${seconds}`;
    }
  }

  const trades = state.mt5.trades || [];
  const signalCount = trades.filter(trade => trade.type === 'SIGNAL').length + state.signals.length;
  const counts = ['SIGNAL', 'REJECTED', 'FAILED', 'EXECUTION'].map(type => ({
    type,
    count: type === 'SIGNAL' ? signalCount : trades.filter(trade => trade.type === type).length,
  }));
  summary.innerHTML = counts.map(item => `<div class="monitor-stat monitor-stat--${item.type.toLowerCase()}"><strong>${item.count}</strong><span>${item.type}</span></div>`).join('');

  if (!trades.length) {
    timeline.innerHTML = '<div class="mt5-empty">No signal or execution records yet.</div>';
    return;
  }

  const liveSignals = state.signals.slice(0, 3).map(signal => ({
    type: 'SIGNAL',
    symbol: signal.signals?.find(item => item.pair === 'XAUUSD')?.action || 'NEWS SIGNAL',
    reason: `${signal.event?.title || 'Signal'} | confidence ${signal.confidence ?? '-'}%`,
    loggedAt: signal.event?.timestamp ? new Date(signal.event.timestamp * 1000).toISOString() : null,
  }));
  timeline.innerHTML = [...liveSignals, ...trades].slice(0, 12).map(trade => {
    const type = trade.type || 'UNKNOWN';
    const detail = trade.error || trade.reason || (trade.success ? `Ticket ${trade.ticket || '-'}` : 'Recorded');
    const symbol = trade.symbol || trade.eventId || 'Trading pipeline';
    const time = trade.loggedAt ? new Date(trade.loggedAt).toLocaleTimeString() : '-';
    return `<div class="trade-row trade-row--${type.toLowerCase()}">
      <div><span class="trade-type">${escapeHtml(type)}</span><span class="trade-symbol">${escapeHtml(symbol)}</span></div>
      <div class="trade-detail">${escapeHtml(detail)}</div>
      <time>${escapeHtml(time)}</time>
    </div>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

async function refreshTradeMonitor() {
  try {
    const response = await fetch('/api/trades');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.mt5.trades = await response.json();
    renderIntelligenceStrip();
    renderExecutionMonitor();
  } catch (err) {
    const timeline = document.getElementById('tradeTimeline');
    if (timeline) timeline.innerHTML = `<div class="mt5-error">Trade journal unavailable: ${escapeHtml(err.message)}</div>`;
  }
}

function renderMt5Account() {
  const card = document.getElementById('mt5AccountCard');
  const data = state.mt5.account;
  if (!data) {
    card.innerHTML = '<h3>Account</h3><div class="mt5-empty">No account data</div>';
    return;
  }
  const acc = data.account || data;
  const items = [
    { label: 'Login', value: acc.login || acc.account || '-' },
    { label: 'Server', value: acc.server || '-' },
    { label: 'Balance', value: fmtNum(acc.balance) },
    { label: 'Equity', value: fmtNum(acc.equity) },
    { label: 'Free Margin', value: fmtNum(acc.margin_free || acc.free_margin) },
    { label: 'Margin', value: fmtNum(acc.margin) },
    { label: 'Margin Level', value: acc.margin_level ? `${fmtNum(acc.margin_level)}%` : '-' },
    { label: 'Leverage', value: acc.leverage ? `1:${acc.leverage}` : '-' },
    { label: 'Currency', value: acc.currency || '-' },
    { label: 'Name', value: acc.name || '-' },
    { label: 'Company', value: acc.company || '-' },
  ];
  card.innerHTML = `<h3>Account</h3><div class="mt5-kv">${items.map(i => `<div class="mt5-k"><span>${i.label}</span><span>${i.value}</span></div>`).join('')}</div>`;
  renderDashboardAccount();
}

function renderMt5Positions() {
  const card = document.getElementById('mt5PositionsCard');
  const positions = state.mt5.positions;
  if (!positions || !positions.length) {
    card.innerHTML = '<h3>Positions</h3><div class="mt5-empty">No open positions</div>';
    return;
  }
  const rows = positions.map(p => {
    const ticket = p.ticket || p.position_id || '-';
    const profit = p.profit != null ? fmtNum(p.profit, 2) : '-';
    const digits = getSymbolDigits(p.symbol);
    return `<tr>
      <td>${ticket}</td>
      <td>${p.symbol || '-'}</td>
      <td>${p.type || p.direction || '-'}</td>
      <td class="numeric">${p.volume != null ? fmtNum(p.volume, 2) : '-'}</td>
      <td class="numeric">${p.price_open != null ? fmtNum(p.price_open, digits) : '-'}</td>
      <td class="numeric">${p.sl != null ? fmtNum(p.sl, digits) : '-'}</td>
      <td class="numeric">${p.tp != null ? fmtNum(p.tp, digits) : '-'}</td>
      <td class="numeric" style="color: ${(p.profit || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${profit}</td>
    </tr>`;
  }).join('');

  const totalPL = positions.reduce((sum, p) => sum + (p.profit || 0), 0);
  const totalColor = totalPL >= 0 ? 'var(--green)' : 'var(--red)';
  const totalSign = totalPL >= 0 ? '+' : '';

  card.innerHTML = `<h3>Positions (${positions.length})</h3>
    <div class="positions-total" style="background: ${totalPL >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border-color: ${totalColor};">
      <span>Total P/L:</span>
      <span style="color: ${totalColor}; font-weight: bold;">${totalSign}$${fmtNum(totalPL, 2)}</span>
    </div>
     <div class="table-wrapper"><table class="mt5-table"><thead><tr><th>Ticket</th><th>Symbol</th><th>Type</th><th class="numeric">Lots</th><th class="numeric">Entry</th><th class="numeric">SL</th><th class="numeric">TP</th><th class="numeric">P/L</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  renderDashboardAccount();
}

function renderMt5Status() {
  const card = document.getElementById('mt5StatusCard');
  const s = state.mt5.status;
  const trading = state.trading;
  const statusClass = s?.status === 'CONNECTED' ? 'online' : s?.status === 'ERROR' ? 'offline' : 'unknown';
  const toolCount = s?.stats?.toolCount ?? '-';
  const heartbeat = state.mt5.lastHeartbeat;
  const isStale = heartbeat?.stale ? ' stale' : '';
  
  card.innerHTML = `<h3>Connection</h3>
    <div class="mt5-kv">
      <div class="mt5-k"><span>Status</span><span class="status-badge ${statusClass}${isStale ? ' stale' : ''}">${s?.status || 'UNKNOWN'}${isStale ? ' (STALE)' : ''}</span></div>
      <div class="mt5-k"><span>URL</span><span>${s?.stats?.url || '-'}</span></div>
      <div class="mt5-k"><span>Tools</span><span>${toolCount}</span></div>
      <div class="mt5-k"><span>Requests</span><span>${s?.stats?.requestCount ?? '-'}</span></div>
      <div class="mt5-k"><span>Errors</span><span>${s?.stats?.errorCount ?? '-'}</span></div>
      <div class="mt5-k"><span>Mode</span><span>${trading.mode || s?.tradingMode || '-'}</span></div>
      <div class="mt5-k"><span>Trading</span><span>${trading.enabled || s?.tradingEnabled ? 'ENABLED' : 'DISABLED'}</span></div>
      <div class="mt5-k"><span>Paused</span><span>${trading.paused ? 'YES' : 'NO'}</span></div>
      <div class="mt5-k"><span>Emergency</span><span>${trading.emergencyClose ? 'ACTIVE' : 'NO'}</span></div>
      <div class="mt5-k"><span>Primary</span><span>${s?.primarySymbol || 'XAUUSD'}</span></div>
      <div class="mt5-k"><span>Last Update</span><span>${heartbeat?.lastUpdate ? new Date(heartbeat.lastUpdate).toLocaleTimeString() : '-'}</span></div>
    </div>
    ${isStale ? '<div class="mt5-error">STALE DATA - MT5 connection may be lost</div>' : ''}
    ${s?.lastError ? `<div class="mt5-error">${s.lastError}</div>` : ''}`;
}

function updateMt5ConnectionStatus(data) {
  const dot = document.getElementById('mt5ConnectionDot');
  const text = document.getElementById('mt5ConnectionText');
  if (data?.connected) {
    if (dot) dot.className = 'status-dot online';
    if (text) text.textContent = 'MT5 Connected';
  } else {
    if (dot) dot.className = 'status-dot offline';
    if (text) text.textContent = 'RECONNECTING';
  }
}

function fmtNum(n, digits = 2) {
  if (n == null) return '-';
  if (typeof n === 'number') {
    if (Number.isInteger(n)) return n.toLocaleString();
    return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  return String(n);
}

function fmtPct(n) {
  if (n == null) return '-';
  if (typeof n === 'number') {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }
  return String(n);
}

function getSymbolDigits(symbol) {
  const marketSymbols = state.mt5.market?.symbols || state.mt5.market || [];
  const found = marketSymbols.find(s => (s.symbol || s.name) === symbol);
  if (found && found.digits != null) {
    return found.digits;
  }
  return 2;
}

function formatPrice(n, symbol) {
  const digits = getSymbolDigits(symbol);
  return fmtNum(n, digits);
}

/* ---- Socket.IO Events ---- */
socket.on('connect', () => {
  updateStatus(true);
  console.log('[Socket.IO] Connected:', socket.id);

  socket.emit('subscribe_signals');
  renderTradePlanCard();
  socket.emit('get_history', (history) => {
    state.history = history || [];
    renderHistory();
  });
  socket.emit('get_events', (data) => {
    if (data && data.error) {
      console.error('[Socket.IO] Events error:', data.error);
      return;
    }
    state.upcoming = data.upcoming || [];
    state.today = data.today || [];
    state.historical = data.historical || [];
    renderEvents();
    renderIntelligenceStrip();
  });

  socket.emit('get_mt5_health', (data) => {
    state.mt5.status = data;
    renderMt5Status();
  });

  socket.emit('get_mt5_account', (data) => {
    state.mt5.account = data;
    renderMt5Account();
    renderIntelligenceStrip();
    renderDashboardAccount();
  });

   socket.emit('get_mt5_positions', (data) => {
     state.mt5.positions = Array.isArray(data) ? data : (data?.positions || []);
     renderMt5Positions();
     renderIntelligenceStrip();
     renderDashboardAccount();
   });

  fetch('/api/performance').then(r => r.json()).then(data => {
    state.performance = data || [];
    renderPerformance();
  }).catch(() => {});

  fetch('/api/trades').then(r => r.json()).then(data => {
    state.mt5.trades = Array.isArray(data) ? data : [];
    renderTradePlanCard();
    renderExecutionMonitor();
  }).catch(() => {});

  fetch('/api/settings').then(r => r.json()).then(data => {
    state.settings = data || {};
    renderSettings();
  }).catch(() => {});

  fetch('/api/trading-mode/status').then(r => r.json()).then(data => {
    state.trading = data || state.trading;
    renderMt5Status();
  }).catch(() => {});

   renderJournal();
   refreshScanner();
   setInterval(refreshScanner, 5000);
   refreshTradeMonitor();
   renderDashboardAccount();
 });

socket.on('disconnect', () => {
  updateStatus(false);
});

socket.on('signal', (result) => {
  state.signals.unshift(result);
  if (state.signals.length > 20) state.signals.pop();
  renderSignals();
  renderTradePlanCard();
  renderExecutionMonitor();
  showToast(
    'New Signal Generated',
    `${result.event?.title || 'Event'} → ${result.direction === 'above' ? 'Bullish' : result.direction === 'below' ? 'Bearish' : 'Neutral'}`,
    result.direction === 'above' ? 'buy' : result.direction === 'below' ? 'sell' : ''
  );
});

socket.on('mt5_health_update', (data) => {
  state.mt5.status = data;
  renderMt5Status();
});

socket.on('mt5_account_update', (data) => {
  state.mt5.account = data;
  renderMt5Account();
  renderIntelligenceStrip();
});

socket.on('mt5_positions_update', (data) => {
  state.mt5.positions = Array.isArray(data) ? data : (data?.positions || []);
  renderMt5Positions();
  renderIntelligenceStrip();
});

socket.on('mt5_heartbeat', (data) => {
  state.mt5.lastHeartbeat = data;
  updateMt5ConnectionStatus(data);
});

socket.on('mt5_connection_status', (data) => {
  state.mt5.connectionStatus = data;
  updateMt5ConnectionStatus(data);
});

setInterval(refreshTradeMonitor, 3000);
setInterval(renderExecutionMonitor, 1000);

socket.on('notification', (data) => {
  if (data.type === 'signal') {
    // Already handled by 'signal' event
  }
});

socket.on('events_update', (data) => {
  state.upcoming = data.upcoming || [];
  state.today = data.today || [];
  state.historical = data.historical || [];
  renderEvents();
  renderIntelligenceStrip();
});

socket.on('strategy_states', (strategies) => {
  // Disabled - uncomment only if you need live strategy status updates
  // state.strategies = strategies;
  // renderStrategies();
});

/* ---- Settings Form ---- */
document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const settings = Object.fromEntries(formData.entries());
  const numericSettings = {
    riskPercent: parseFloat(settings.riskPercent) || 1,
    ocoEnabled: settings.ocoEnabled === 'true',
    maxOpenTrades: parseInt(settings.maxOpenTrades, 10) || 3,
    dailyLossLimit: parseFloat(settings.dailyLossLimit) || 50,
  };

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(numericSettings),
  }).then(() => {
    state.settings = { ...state.settings, ...numericSettings };
    showToast('Settings Saved', 'Risk configuration updated.', 'info');
  }).catch(() => {
    showToast('Error', 'Failed to save settings.', 'sell');
  });
});

let journalFilter = 'ALL';
let catalog = { supported: {}, selected: [], details: [] };

async function loadCatalog() {
  try {
    const res = await fetch('/api/pairs');
    const data = await res.json();
    catalog.supported = data.supported || {};
    catalog.selected = data.selected || [];
    catalog.details = data.details || [];
    renderInstrumentSelector();
    renderJournalFilter();
  } catch (err) {
    console.error('loadCatalog failed', err);
  }
}

function renderInstrumentSelector() {
  const root = document.getElementById('instrumentSelector');
  if (!root) return;
  if (!catalog.details.length) {
    root.innerHTML = '<div class="empty-state">No instruments loaded.</div>';
    return;
  }
  const groups = {};
  for (const d of catalog.details) {
    const cat = (catalog.supported[d.id]?.category) || 'other';
    (groups[cat] = groups[cat] || []).push(d);
  }
  const order = ['metals', 'crypto', 'indices_us', 'indices_eu', 'indices_asia', 'energy', 'other'];
  root.innerHTML = order
    .filter((c) => groups[c])
    .map((c) => {
      const items = groups[c].map(renderInstrumentChip).join('');
      return `<div class="instr-group"><div class="instr-group-title">${c.replace(/_/g, ' ').toUpperCase()}</div>${items}</div>`;
    })
    .join('');
  root.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const newSel = new Set(catalog.selected);
      if (newSel.has(id)) newSel.delete(id);
      else newSel.add(id);
      const r = await fetch('/api/pairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: [...newSel] }) });
      if (r.ok) {
        const j = await r.json();
        catalog.selected = j.selected || [];
        renderInstrumentSelector();
        renderJournalFilter();
      }
    });
  });
}

function renderInstrumentChip(d) {
  const selected = catalog.selected.includes(d.id);
  const meta = catalog.supported[d.id] || {};
  const live = d.available ? `→ <b>${escapeHtml(d.actualSymbol || d.id)}</b>` : '⚠ unavailable';
  const cls = d.available ? (selected ? 'instr-chip--on' : 'instr-chip--off') : 'instr-chip--off instr-chip--unavail';
  return `<button class="instr-chip ${cls}" data-id="${d.id}" title="${escapeHtml(meta.label || d.id)}">
    <span class="instr-chip__icon">${meta.icon || '•'}</span>
    <span class="instr-chip__id">${escapeHtml(d.id)}</span>
    <span class="instr-chip__live">${live}</span>
  </button>`;
}

function renderJournalFilter() {
  const root = document.getElementById('journalFilter');
  if (!root) return;
  const ids = catalog.selected && catalog.selected.length ? catalog.selected : Object.keys(catalog.supported);
  const chips = ['ALL', ...ids].map((id) => {
    const meta = id === 'ALL' ? { label: 'ALL', icon: '' } : (catalog.supported[id] || { label: id, icon: '•' });
    const active = journalFilter === id;
    return `<button class="filter-btn ${active ? 'active' : ''}" data-symbol="${escapeHtml(id)}">${meta.icon ? meta.icon + ' ' : ''}${escapeHtml(id === 'ALL' ? 'ALL' : id)}</button>`;
  }).join('');
  root.innerHTML = chips;
  root.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      journalFilter = btn.dataset.symbol;
      root.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderJournal();
    });
  });
}

async function renderJournal() {
  const body = document.getElementById('journalBody');
  if (!body) return;
  let url = '/api/trades';
  if (journalFilter !== 'ALL') url += `?symbol=${journalFilter}`;
  try {
    const res = await fetch(url);
    const trades = await res.json();
    if (!Array.isArray(trades) || !trades.length) {
      body.innerHTML = '<tr><td colspan="11" class="empty-state">No trades recorded.</td></tr>';
      return;
    }
    body.innerHTML = trades.slice().reverse().map(renderJournalRow).join('');
  } catch {
    body.innerHTML = '<tr><td colspan="11" class="empty-state">Journal unavailable.</td></tr>';
  }
}

function renderJournalRow(t) {
  const dir = String(t.direction || '').toUpperCase();
  const pnl = t.profit != null ? t.profit : (t.pl != null ? t.pl : null);
  const digits = 2;
  const lot = t.lot_size != null ? t.lot_size : (t.volume != null ? t.volume : null);
  const sym = t.symbol || '-';
  const symClass = `pair-tag--${sym.toLowerCase()}`;

  if (t.type === 'REJECTED' || t.type === 'NO_TRADE' || t.type === 'FAILED') {
    return `<tr>
      <td>${t.loggedAt ? new Date(t.loggedAt).toLocaleString() : '-'}</td>
      <td colspan="2"><span class="status-badge status-${t.type.toLowerCase()}">${t.type}</span></td>
      <td colspan="8" style="color: var(--text-secondary); font-size: 0.75rem;">${escapeHtml(t.reason || '-')}</td>
    </tr>`;
  }

  return `<tr>
    <td>${t.loggedAt ? new Date(t.loggedAt).toLocaleString() : '-'}</td>
    <td>${t.ticket || t.position_id || '-'}</td>
    <td><span class="pair-tag ${symClass}">${escapeHtml(sym)}</span>${t.actualSymbol && t.actualSymbol !== t.symbol ? `<br><small>→ ${escapeHtml(t.actualSymbol)}</small>` : ''}</td>
    <td><span class="direction-badge ${dir.toLowerCase()}">${dir || '-'}</span></td>
    <td class="numeric">${lot != null ? fmtNum(lot, 2) : '-'}</td>
    <td class="numeric">${t.entry != null ? fmtNum(t.entry, digits) : '-'}</td>
    <td class="numeric">${t.stop_loss != null ? fmtNum(t.stop_loss, digits) : '-'}</td>
    <td class="numeric">${t.take_profit != null ? fmtNum(t.take_profit, digits) : '-'}</td>
    <td class="numeric">${t.risk_reward != null ? fmtNum(t.risk_reward, 2) : '-'}</td>
    <td class="numeric">${t.risk_amount != null ? '$' + fmtNum(t.risk_amount, 2) : '-'}</td>
    <td class="numeric" style="color:${(pnl || 0) >= 0 ? 'var(--green)' : 'var(--red)'}">${pnl != null ? '$' + fmtNum(pnl, 2) : '-'}</td>
  </tr>`;
}

document.getElementById('refreshInstruments')?.addEventListener('click', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Detecting…';
  try {
    await fetch('/api/pairs/refresh', { method: 'POST' });
    await loadCatalog();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Re-detect broker instruments';
  }
});

/* ---- Strategy States ---- */
async function loadStrategies() {
  try {
    const res = await fetch(`/api/strategies/states?_t=${Date.now()}`);
    const strategies = await res.json();
    const isFirstLoad = !state.strategies || state.strategies.length === 0;
    state.strategies = strategies;
    if (isFirstLoad) {
      const grid = document.getElementById('strategiesGrid');
      if (grid) grid.innerHTML = state.strategies.map(renderStrategyCard).join('');
    } else {
      renderStrategies();
    }
  } catch (err) {
    console.error('loadStrategies failed', err);
  }
}

async function loadInstruments() {
  try {
    const res = await fetch(`/api/strategies/instruments?_t=${Date.now()}`);
    const instruments = await res.json();
    state.availableInstruments = instruments;
  } catch (err) {
    console.error('loadInstruments failed', err);
  }
}

async function triggerScan() {
  try {
    await fetch('/api/strategies/scan', { method: 'POST' });
    await loadStrategies();
  } catch (err) {
    console.error('triggerScan failed', err);
  }
}

async function saveStrategySymbols(strategy, symbols) {
  try {
    await fetch(`/api/strategies/${strategy}/symbols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols }),
    });
    await loadStrategies();
    showToast('Symbols Updated', `${strategy} now trades: ${symbols.join(', ')}`, 'info');
  } catch (err) {
    console.error('saveStrategySymbols failed', err);
    showToast('Error', 'Failed to update symbols', 'sell');
  }
}

function renderStrategies() {
  const grid = document.getElementById('strategiesGrid');
  if (!grid) return;
  if (!state.strategies || !state.strategies.length) {
    grid.innerHTML = '<div class="empty-state">No strategies loaded.</div>';
    return;
  }
  // Don't re-render entire grid - only update text content to preserve dropdowns
  state.strategies.forEach(s => {
    const card = grid.querySelector(`[data-strategy="${s.strategy}"]`);
    if (!card) return;
    const statusEl = card.querySelector('.strategy-status');
    if (statusEl) statusEl.textContent = s.status;
    const lastScanEl = card.querySelector('.strategy-last-scan');
    if (lastScanEl && s.lastScanTime) {
      const d = new Date(s.lastScanTime);
      lastScanEl.innerHTML = `<span>${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, '0')}</span>`;
    }
  });
}

function renderStrategyCard(s) {
  const statusClass = {
    WAITING: 'strategy-card--waiting',
    OPPORTUNITY: 'strategy-card--opportunity',
    ERROR: 'strategy-card--error',
    SCANNING: 'strategy-card--scanning',
  }[s.status] || 'strategy-card--scanning';

  const statusBadgeClass = {
    WAITING: 'strategy-status--waiting',
    OPPORTUNITY: 'strategy-status--opportunity',
    ERROR: 'strategy-status--error',
    SCANNING: 'strategy-status--scanning',
  }[s.status] || 'strategy-status--scanning';

  let phaseText = s.phases && s.phases[s.currentPhase] ? s.phases[s.currentPhase] : 'Scanning...';
  const phaseIcon = s.status === 'WAITING' ? '⏳' : s.status === 'OPPORTUNITY' ? '🎯' : s.status === 'ERROR' ? '⚠️' : '🔍';

  // SweepEA: show live count-down / count-up to target time
  if (s.strategy === 'SWEEP_EA') {
    const now = new Date();
    const nairobiOffset = 3 * 60;
    const utcMin = now.getUTCMinutes();
    const utcHr = now.getUTCHours();
    const nairobiMin = (utcMin + nairobiOffset) % 60;
    const nairobiHr = (utcHr + Math.floor((utcMin + nairobiOffset) / 60)) % 24;
    const currentSec = now.getUTCSeconds();
    const currentMs = now.getUTCMilliseconds();
    const targetHr = 16, targetMin = 30;
    const nowSecOfDay = nairobiHr * 3600 + nairobiMin * 60 + currentSec;
    const targetSecOfDay = targetHr * 3600 + targetMin * 60;
    const diffSec = targetSecOfDay - nowSecOfDay;
    if (s.status === 'OPPORTUNITY' || (s.lastOpportunity && new Date(s.lastOpportunity.timestamp).toDateString() === now.toDateString())) {
      phaseText = `✅ Trade executed at ${new Date(s.lastOpportunity.timestamp).toLocaleTimeString()}`;
    } else if (diffSec > 0 && diffSec <= 3600) {
      const m = Math.floor(diffSec / 60);
      const sec = diffSec % 60;
      phaseText = `⏱ ${m}m ${sec}s to 16:30`;
    } else if (diffSec <= 0 && diffSec > -120) {
      phaseText = `🎯 LIVE — executing trade!`;
    } else if (diffSec <= -120) {
      phaseText = `✅ Done today — next 16:30 tomorrow`;
    } else {
      phaseText = `⏱ Next: 16:30`;
    }
  }

  const progressSteps = s.phases ? s.phases.map((_, i) => {
    const active = i === s.currentPhase ? 'strategy-progress-step--active' : '';
    const completed = i < s.currentPhase ? 'strategy-progress-step--completed' : '';
    return `<div class="strategy-progress-step ${active} ${completed}"></div>`;
  }).join('') : '';

  const currentSymbol = s.symbols && s.symbols.length > 0 ? s.symbols[s.symbols.length - 1] : null;

  // Build symbol dropdown options
  const allInstruments = state.availableInstruments || { metals: [], forex: [], indices: [], energy: [] };
  const allSymbols = [
    ...(allInstruments.metals || []),
    ...(allInstruments.forex || []),
    ...(allInstruments.indices || []),
    ...(allInstruments.energy || []),
  ];

  const selectedSymbols = s.allowedSymbols || [];

  const dropdownOptions = allSymbols.map(sym => {
    const selected = selectedSymbols.includes(sym) ? 'selected' : '';
    return `<option value="${sym}" ${selected}>${sym}</option>`;
  }).join('');

  const selectedDisplay = selectedSymbols.length > 0 ? selectedSymbols.join(', ') : 'None';

  const symbolDropdown = `
    <div class="strategy-symbol-selector">
      <select class="strategy-symbol-dropdown" data-strategy="${s.strategy}" multiple size="1">
        ${dropdownOptions}
      </select>
      <button class="strategy-symbol-save" data-strategy="${s.strategy}">Save</button>
    </div>
    <div class="strategy-selected-symbols">Selected: <strong>${escapeHtml(selectedDisplay)}</strong></div>
  `;

  const lastOpp = s.lastOpportunity ? `
    <div class="strategy-last-opportunity strategy-last-opportunity--${s.lastOpportunity.direction.toLowerCase()}">
      Last: ${s.lastOpportunity.direction} ${s.lastOpportunity.symbol} @ ${s.lastOpportunity.score}/100
      ${s.lastOpportunity.timestamp ? `(${new Date(s.lastOpportunity.timestamp).toLocaleTimeString()})` : ''}
    </div>
  ` : '';

  const errorText = s.error ? `<div style="color:#FF4D4D;font-size:11px;margin-top:4px;">${escapeHtml(s.error)}</div>` : '';

  const lastScan = s.lastScanTime
    ? (() => {
        const d = new Date(s.lastScanTime);
        const time = d.toLocaleTimeString();
        const ms = String(d.getMilliseconds()).padStart(3, '0');
        return `<span>${time}.${ms}</span>`;
      })()
    : '<span>Not yet</span>';

  return `
    <div class="strategy-card ${statusClass}" data-strategy="${s.strategy}">
      <div class="strategy-header">
        <span class="strategy-name">${escapeHtml(s.displayName || s.strategy)}</span>
        <span class="strategy-status ${statusBadgeClass}">${s.status}</span>
      </div>
      <div class="strategy-description">${escapeHtml(s.description || '')}</div>
      <div class="strategy-phase">
        <span class="strategy-phase-icon">${phaseIcon}</span>
        <span class="strategy-phase-text">${escapeHtml(phaseText)}</span>
      </div>
      ${progressSteps ? `<div class="strategy-progress">${progressSteps}</div>` : ''}
      <div class="strategy-meta">
        <span>Current: ${currentSymbol ? `<strong>${escapeHtml(currentSymbol)}</strong>` : '--'}</span>
        <span class="strategy-last-scan">Last scan: ${lastScan}</span>
      </div>
      ${symbolDropdown}
      ${lastOpp}
      ${errorText}
    </div>
  `;
}

/* ---- Init ---- */
loadCatalog();
loadInstruments();
loadStrategies();
// Live SweepEA countdown updater - runs every second without re-rendering
setInterval(() => {
  const sweepCard = document.querySelector('[data-strategy="SWEEP_EA"]');
  if (!sweepCard) return;
  const phaseEl = sweepCard.querySelector('.strategy-phase-text');
  if (!phaseEl) return;
  const now = new Date();
  const nairobiMin = (now.getUTCMinutes() + 180) % 60;
  const nairobiHr = (now.getUTCHours() + 3) % 24;
  const currentSec = now.getUTCSeconds();
  const targetHr = 16, targetMin = 30;
  const nowSecOfDay = nairobiHr * 3600 + nairobiMin * 60 + currentSec;
  const targetSecOfDay = targetHr * 3600 + targetMin * 60;
  const diffSec = targetSecOfDay - nowSecOfDay;
  const m = Math.floor(Math.abs(diffSec) / 60);
  const sec = Math.abs(diffSec) % 60;
  const mStr = String(m).padStart(2, '0');
  const sStr = String(sec).padStart(2, '0');
  if (diffSec > 0 && diffSec <= 3600) {
    phaseEl.textContent = `⏱ ${m}m ${sStr}s to 16:30`;
  } else if (diffSec <= 0 && diffSec > -120) {
    phaseEl.textContent = `🎯 LIVE — executing trade!`;
  } else if (diffSec <= -120) {
    phaseEl.textContent = `✅ Done today — next 16:30 tomorrow`;
  } else {
    phaseEl.textContent = `⏱ Next: 16:30 (${m}m ${sStr}s)`;
  }
}, 1000);

// Periodic refresh disabled - only SweepEA countdown ticks every second
// Data refresh happens only on user actions (clicking Scan Now, etc.)
// setInterval(loadStrategies, 5000);

// Track server start time for uptime display
let serverStartTime = null;
fetch('/api/health')
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(data => { if (data && data.startTime) serverStartTime = new Date(data.startTime); })
  .catch(() => {});

// Live update: Uptime + Last update every second
setInterval(() => {
  const now = new Date();
  // Last update
  const lastUpd = document.getElementById('lastUpdate');
  if (lastUpd) {
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    lastUpd.textContent = `${h}:${m}:${s}.${ms}`;
  }
  // Uptime
  const upEl = document.getElementById('uptime');
  if (upEl) {
    const base = serverStartTime || (window._pageLoadTime || now);
    const elapsedMs = now - base;
    const totalSec = Math.floor(elapsedMs / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    upEl.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }
}, 1000);

// Scan button
document.getElementById('scanStrategies')?.addEventListener('click', async () => {
  const btn = document.getElementById('scanStrategies');
  btn.disabled = true;
  btn.textContent = '⏳ Scanning...';
  try {
    await triggerScan();
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Scan Now';
  }
});

// Strategy symbol save buttons (delegated event listener)
document.addEventListener('click', async (e) => {
  if (e.target.classList.contains('strategy-symbol-save')) {
    const strategy = e.target.dataset.strategy;
    const dropdown = document.querySelector(`.strategy-symbol-dropdown[data-strategy="${strategy}"]`);
    if (dropdown) {
      const selectedSymbols = Array.from(dropdown.selectedOptions).map(opt => opt.value);
      if (selectedSymbols.length > 0) {
        e.target.disabled = true;
        e.target.textContent = 'Saving...';
        try {
          await saveStrategySymbols(strategy, selectedSymbols);
        } finally {
          e.target.disabled = false;
          e.target.textContent = 'Save';
        }
      }
    }
  }
});

// P&L Overview chart
(async function initPnlChart() {
  const canvas = document.getElementById('pnlCanvas');
  const legendGrid = document.getElementById('pnlLegend');
  const totalEl = document.getElementById('totalPL');
  const totalSub = document.getElementById('totalPLSub');
  const winEl = document.getElementById('pnlWinRate');
  const bestEl = document.getElementById('pnlBest');
  const worstEl = document.getElementById('pnlWorst');
  const subtitle = document.getElementById('pnlSubtitle');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const cx = W / 2;
  const cy = H / 2;
  const outerR = 170;
  const innerR = 115;
  const gap = 0.04;
  let pairsData = [];
  let hoveredIndex = -1;

  const COLORS = [
    '#f7931a','#627eea','#ec4899','#14b8a6','#f43f5e','#8b5cf6',
    '#3dd68c','#fbbf24','#60a5fa','#f472b6','#34d399','#a78bfa'
  ];

  function lighten(hex, amt) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, r + amt);
    g = Math.min(255, g + amt);
    b = Math.min(255, b + amt);
    return `rgb(${r},${g},${b})`;
  }

  function load() {
    if (subtitle) subtitle.textContent = 'Loading...';
    fetch('/api/analytics/pnl?_t=' + Date.now())
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        if (!data || !data.pairs || !data.pairs.length) {
          pairsData = [];
          if (subtitle) subtitle.textContent = 'No trade data yet';
          render([]);
          return;
        }
        pairsData = data.pairs.map((p, i) => ({
          pair: p.symbol || p.pair || ('Pair ' + (i + 1)),
          pl: p.plPercent || p.pl || 0,
          value: p.pl || 0,
          trades: p.trades || 0,
          color: COLORS[i % COLORS.length],
        }));
        if (subtitle) subtitle.textContent = data.pairs.length + ' pairs';
        render(pairsData);
        updateStats(data);
      })
      .catch(() => {
        pairsData = [];
        if (subtitle) subtitle.textContent = 'Unavailable';
        render([]);
      });
  }

  function render(pairs) {
    if (totalEl) totalEl.textContent = '--';
    if (totalSub) totalSub.textContent = '--';
    if (legendGrid) legendGrid.innerHTML = '';
    if (!pairs.length) {
      drawChart([]);
      return;
    }
    const sorted = [...pairs].sort((a, b) => b.pl - a.pl);
    const totalPL = pairs.reduce((s, p) => s + (p.value || 0), 0);
    const totalPLPercent = pairs.reduce((s, p) => s + (p.pl || 0), 0);
    const isPositive = totalPL >= 0;
    if (totalEl) {
      totalEl.textContent = (isPositive ? '+' : '') + '$' + Math.round(totalPL).toLocaleString();
      totalEl.className = 'amount ' + (isPositive ? 'positive' : 'negative');
    }
    if (totalSub) totalSub.textContent = (isPositive ? '+' : '') + (totalPLPercent.toFixed(1) || '0') + '% · ' + pairs.length + ' pairs';
    if (legendGrid) {
      sorted.forEach(p => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        const sign = p.pl >= 0 ? '+' : '';
        item.innerHTML = `<span class="color-dot" style="background:${p.color};"></span><span class="pair-name">${p.pair}</span><span class="pair-value ${p.pl >= 0 ? 'positive' : 'negative'}">${sign}${p.pl.toFixed(1)}%</span>`;
        legendGrid.appendChild(item);
      });
    }
    drawChart(pairs);
  }

  function updateStats(data) {
    if (winEl) winEl.textContent = (data.winRate || 0) + '%';
    if (bestEl && data.best) bestEl.textContent = data.best.symbol + ' +' + (data.best.plPercent || data.best.pl || 0) + '%';
    if (worstEl && data.worst) worstEl.textContent = data.worst.symbol + ' ' + (data.worst.plPercent || data.worst.pl || 0) + '%';
  }

  function drawChart(pairs) {
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createRadialGradient(cx, cy, 100, cx, cy, 280);
    grad.addColorStop(0, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 280, 0, Math.PI * 2);
    ctx.fill();
    const absSum = pairs.reduce((s, p) => s + Math.abs(p.pl || 0), 0);
    if (!absSum) return;
    let startAngle = -Math.PI / 2;
    pairs.forEach((p, i) => {
      const weight = Math.abs(p.pl || 0) / absSum;
      const sliceAngle = weight * Math.PI * 2;
      const endAngle = startAngle + sliceAngle - gap;
      const isHovered = i === hoveredIndex;
      let color = p.color || COLORS[i % COLORS.length];
      if (isHovered) color = lighten(color, 30);
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      p._startAngle = startAngle;
      p._endAngle = endAngle;
      startAngle = endAngle + gap;
    });
    const innerGrad = ctx.createRadialGradient(cx, cy, innerR - 6, cx, cy, innerR + 4);
    innerGrad.addColorStop(0, 'rgba(0,0,0,0)');
    innerGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
    innerGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function getHoveredIndex(mx, my) {
    if (!pairsData.length) return -1;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (mx - rect.left) * scaleX;
    const y = (my - rect.top) * scaleY;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < innerR || dist > outerR) return -1;
    let angle = Math.atan2(dy, dx) + Math.PI / 2;
    if (angle < 0) angle += Math.PI * 2;
    for (let i = 0; i < pairsData.length; i++) {
      const p = pairsData[i];
      let s = (p._startAngle || 0) + Math.PI / 2;
      let e = (p._endAngle || 0) + Math.PI / 2;
      if (s < 0) s += Math.PI * 2;
      if (e < 0) e += Math.PI * 2;
      if (s < e) {
        if (angle >= s && angle <= e) return i;
      } else {
        if (angle >= s || angle <= e) return i;
      }
    }
    return -1;
  }

  canvas.addEventListener('mousemove', (e) => {
    const idx = getHoveredIndex(e.clientX, e.clientY);
    if (idx !== hoveredIndex) {
      hoveredIndex = idx;
      canvas.style.cursor = idx >= 0 ? 'pointer' : 'default';
      drawChart(pairsData);
    }
  });
  canvas.addEventListener('mouseleave', () => {
    hoveredIndex = -1;
    drawChart(pairsData);
  });
  load();
  setInterval(load, 5000);
})();

updateStatus(false);
