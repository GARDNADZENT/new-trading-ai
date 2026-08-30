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
  if (state.settings.impactFilter) {
    document.getElementById('impactFilter').value = state.settings.impactFilter;
  }
  if (state.settings.pollIntervalMs) {
    document.getElementById('pollIntervalSeconds').value = String(state.settings.pollIntervalMs / 1000);
  }
  if (state.settings.confidenceThreshold) {
    document.getElementById('confidenceThreshold').value = state.settings.confidenceThreshold;
  }
  document.getElementById('telegramEnabled').checked = state.settings.telegramEnabled || false;
  document.getElementById('discordEnabled').checked = state.settings.discordEnabled || false;
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

/* ---- MT5 Dashboard ---- */
function renderMt5Dashboard() {
  renderIntelligenceStrip();
  renderTradePlanCard();
  renderMt5Account();
  renderMt5Market();
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
}

function renderMt5Market() {
  const card = document.getElementById('mt5MarketCard');
  const symbols = state.mt5.market;
  if (!symbols || !symbols.length) {
    card.innerHTML = '<h3>Market</h3><div class="mt5-empty">No market data</div>';
    return;
  }
  const rows = symbols.slice(0, 20).map(s => {
    const rawSpread = s.spread != null ? s.spread : (s.ask - s.bid);
    const digits = s.digits != null ? s.digits : 2;
    return `<tr>
      <td>${s.symbol || s.name || '-'}</td>
      <td class="numeric">${s.bid != null ? fmtNum(s.bid, digits) : '-'}</td>
      <td class="numeric">${s.ask != null ? fmtNum(s.ask, digits) : '-'}</td>
      <td class="numeric">${rawSpread != null ? fmtNum(rawSpread, digits) : '-'}</td>
      <td>${digits}</td>
    </tr>`;
  }).join('');
  card.innerHTML = `<h3>Market (${symbols.length} symbols)</h3>
    <div class="table-wrapper"><table class="mt5-table"><thead><tr><th>Symbol</th><th class="numeric">Bid</th><th class="numeric">Ask</th><th class="numeric">Spread</th><th>Digits</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  card.innerHTML = `<h3>Positions (${positions.length})</h3>
    <div class="table-wrapper"><table class="mt5-table"><thead><tr><th>Ticket</th><th>Symbol</th><th>Type</th><th class="numeric">Lots</th><th class="numeric">Entry</th><th class="numeric">SL</th><th class="numeric">TP</th><th class="numeric">P/L</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
  });

  socket.emit('get_mt5_positions', (data) => {
    state.mt5.positions = Array.isArray(data) ? data : (data?.positions || []);
    renderMt5Positions();
    renderIntelligenceStrip();
  });

  socket.emit('get_mt5_market', (data) => {
    state.mt5.market = Array.isArray(data) ? data : [];
    renderMt5Market();
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

  fetchPairs();
  renderJournal();

  refreshTradeMonitor();
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

socket.on('mt5_market_update', (data) => {
  state.mt5.market = Array.isArray(data) ? data : (data?.symbols || []);
  renderMt5Market();
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

/* ---- Settings Form ---- */
document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const settings = Object.fromEntries(formData.entries());
  const numericSettings = {
    pollIntervalSeconds: parseInt(settings.pollIntervalSeconds, 10),
    confidenceThreshold: parseInt(settings.confidenceThreshold, 10),
    impactFilter: settings.impactFilter,
  };

  fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(numericSettings),
  }).then(() => {
    state.settings = { ...state.settings, ...numericSettings };
    showToast('Settings Saved', 'Configuration updated. Restart recommended for some changes.', 'info');
  }).catch(() => {
    showToast('Error', 'Failed to save settings.', 'sell');
  });
});

/* ---- Pairs (XAUUSD + BTCUSD) ---- */
state.pairs = { details: [], selected: [], btcRelated: [] };
let journalFilter = 'ALL';

async function fetchPairs() {
  try {
    const res = await fetch('/api/pairs');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.pairs.details = data.details || [];
    state.pairs.selected = data.selected || [];
    state.pairs.btcRelated = data.btcRelated || [];
    renderPairsSelector('pairsSelector');
    renderPairsSelector('pairsSelectorFull');
    renderPairCards('pairsCards');
    renderPairCards('pairsCardsFull');
    renderBotBuilderPairs();
  } catch (err) {
    console.error('fetchPairs failed', err.message);
  }
}

function renderPairsSelector(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const selected = state.pairs.selected;
  const details = state.pairs.details.length
    ? state.pairs.details
    : [{ symbol: 'XAUUSD', label: 'Gold / US Dollar', icon: '🥇' }, { symbol: 'BTCUSD', label: 'Bitcoin / US Dollar', icon: '₿' }];
  el.innerHTML = details.map(d => {
    const active = selected.includes(d.symbol);
    return `<button class="pair-btn ${active ? 'pair-btn--active' : ''}" data-symbol="${d.symbol}">${d.icon || ''} ${d.symbol}</button>`;
  }).join('');
  el.querySelectorAll('.pair-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sym = btn.dataset.symbol;
      const newSel = new Set(state.pairs.selected);
      if (newSel.has(sym)) newSel.delete(sym); else newSel.add(sym);
      try {
        const res = await fetch('/api/pairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: [...newSel] }) });
        if (res.ok) { const j = await res.json(); state.pairs.selected = j.selected; }
      } catch {}
      renderPairsSelector('pairsSelector'); renderPairsSelector('pairsSelectorFull');
      renderPairCards('pairsCards'); renderPairCards('pairsCardsFull');
      renderBotBuilderPairs();
    });
  });
}

async function renderPairCards(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const selected = state.pairs.selected;
  if (!selected.length) { el.innerHTML = '<div class="empty-state">No pairs selected. Choose an instrument above.</div>'; return; }
  el.innerHTML = selected.map(sym => `<div class="pair-card" id="paircard-${sym}"><div class="mt5-empty">Loading ${escapeHtml(sym)}...</div></div>`).join('');
  for (const sym of selected) {
    await renderPairCard(sym, `paircard-${sym}`);
  }
}

async function renderPairCard(sym, id) {
  const el = document.getElementById(id);
  if (!el) return;
  let avail;
  try { const r = await fetch(`/api/pairs/${sym}/availability`); avail = await r.json(); } catch { avail = { available: false, reason: 'fetch failed' }; }
  const meta = state.pairs.details.find(d => d.symbol === sym) || { label: sym, icon: sym === 'BTCUSD' ? '₿' : '🥇' };
  if (!avail.available) {
    let disc = '';
    if (sym === 'BTCUSD' && state.pairs.btcRelated && state.pairs.btcRelated.length) {
      disc = `<div class="pair-unavailable-disc">Available BTC-related symbols discovered on this account:<ul>${state.pairs.btcRelated.map(s => `<li>${escapeHtml(s.symbol)} — ${escapeHtml(s.description || '')}</li>`).join('')}</ul></div>`;
    }
    el.innerHTML = `<div class="pair-card__header">${meta.icon} ${escapeHtml(sym)} <span class="pair-card__label">${escapeHtml(meta.label)}</span></div>
      <div class="pair-unavailable">⚠ ${escapeHtml(sym)} unavailable on this MT5 account/broker.</div>${disc}`;
    return;
  }
  const spec = avail.spec || {};
  const spread = spec.spread != null ? spec.spread : (spec.ask && spec.bid ? spec.ask - spec.bid : null);
  const digits = spec.digits || (sym === 'BTCUSD' ? 2 : 5);
  el.innerHTML = `<div class="pair-card__header">${meta.icon} ${escapeHtml(sym)} <span class="pair-card__label">${escapeHtml(meta.label)}</span></div>
    <div class="pair-card__rows">
      <div><span>Bid</span><b>${fmtNum(spec.bid, digits)}</b></div>
      <div><span>Ask</span><b>${fmtNum(spec.ask, digits)}</b></div>
      <div><span>Spread</span><b>${fmtNum(spread, digits)}</b></div>
      <div><span>Actual</span><b>${escapeHtml(avail.actualSymbol || sym)}</b></div>
      <div><span>Min Lot</span><b>${fmtNum(spec.min_lot, 4)}</b></div>
      <div><span>Contract</span><b>${fmtNum(spec.contract_size)}</b></div>
    </div>
    <div class="pair-card__news">News Mode: <b>${sym === 'BTCUSD' ? 'MONITORING' : 'READY'}</b></div>
    <div class="pair-card__risk">Risk: <b>Protected</b></div>`;
}

function renderBotBuilderPairs() {
  const el = document.getElementById('botBuilderPairs');
  if (!el) return;
  const details = state.pairs.details.length
    ? state.pairs.details
    : [{ symbol: 'XAUUSD', icon: '🥇' }, { symbol: 'BTCUSD', icon: '₿' }];
  el.innerHTML = details.map(d => `<label class="bot-pair"><input type="checkbox" data-symbol="${d.symbol}" ${state.pairs.selected.includes(d.symbol) ? 'checked' : ''}/> ${d.icon || ''} ${d.symbol}</label>`).join('');
  el.querySelectorAll('input').forEach(cb => cb.addEventListener('change', async () => {
    const newSel = details.filter(d => { const inp = el.querySelector(`input[data-symbol="${d.symbol}"]`); return inp && inp.checked; }).map(d => d.symbol);
    try {
      const res = await fetch('/api/pairs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pairs: newSel }) });
      if (res.ok) { const j = await res.json(); state.pairs.selected = j.selected; }
    } catch {}
    renderPairsSelector('pairsSelector'); renderPairsSelector('pairsSelectorFull');
    renderPairCards('pairsCards'); renderPairCards('pairsCardsFull');
    renderBotBuilderPairs();
  }));
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
  const digits = t.symbol === 'BTCUSD' ? 2 : 5;
  const lot = t.lot_size != null ? t.lot_size : (t.volume != null ? t.volume : null);
  const symClass = t.symbol === 'BTCUSD' ? 'pair-tag--btc' : 'pair-tag--xau';
  return `<tr>
    <td>${t.loggedAt ? new Date(t.loggedAt).toLocaleString() : '-'}</td>
    <td>${t.ticket || t.position_id || '-'}</td>
    <td><span class="pair-tag ${symClass}">${escapeHtml(t.symbol || '-')}</span></td>
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

document.querySelectorAll('#journalFilter .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#journalFilter .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    journalFilter = btn.dataset.symbol;
    renderJournal();
  });
});

/* ---- Init ---- */
updateStatus(false);
