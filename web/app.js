const socket = io();
const state = {
  upcoming: [],
  today: [],
  historical: [],
  signals: [],
  history: [],
  performance: [],
  settings: {},
  mt5: {
    account: null,
    market: [],
    positions: [],
    status: null,
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

  const confClass = r.confidence >= 80 ? 'high' : r.confidence >= 60 ? 'medium' : 'low';
  const confWidth = Math.min(100, r.confidence);
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
          <span class="confidence-value">${r.confidence}% Confidence</span>
          <div class="confidence-track"><div class="confidence-fill ${confClass}" style="width: ${confWidth}%"></div></div>
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
  renderMt5Account();
  renderMt5Market();
  renderMt5Positions();
  renderMt5Status();
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
      <div class="mt5-k"><span>Mode</span><span>${s?.tradingMode || '-'}</span></div>
      <div class="mt5-k"><span>Trading</span><span>${s?.tradingEnabled ? 'ENABLED' : 'DISABLED'}</span></div>
      <div class="mt5-k"><span>Primary</span><span>${s?.primarySymbol || '-'}</span></div>
      <div class="mt5-k"><span>Last Update</span><span>${heartbeat?.lastUpdate ? new Date(heartbeat.lastUpdate).toLocaleTimeString() : '-'}</span></div>
    </div>
    ${isStale ? '<div class="mt5-error">STALE DATA - MT5 connection may be lost</div>' : ''}
    ${s?.lastError ? `<div class="mt5-error">${s.lastError}</div>` : ''}`;
}

function updateMt5ConnectionStatus(data) {
  if (!data || !data.connected) {
    const dot = document.getElementById('mt5ConnectionDot');
    const text = document.getElementById('mt5ConnectionText');
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
  });

  socket.emit('get_mt5_health', (data) => {
    state.mt5.status = data;
    renderMt5Status();
  });

  socket.emit('get_mt5_account', (data) => {
    state.mt5.account = data;
    renderMt5Account();
  });

  socket.emit('get_mt5_positions', (data) => {
    state.mt5.positions = Array.isArray(data) ? data : (data?.positions || []);
    renderMt5Positions();
  });

  socket.emit('get_mt5_market', (data) => {
    state.mt5.market = Array.isArray(data) ? data : [];
    renderMt5Market();
  });

  fetch('/api/performance').then(r => r.json()).then(data => {
    state.performance = data || [];
    renderPerformance();
  }).catch(() => {});

  fetch('/api/settings').then(r => r.json()).then(data => {
    state.settings = data || {};
    renderSettings();
  }).catch(() => {});
});

socket.on('disconnect', () => {
  updateStatus(false);
});

socket.on('signal', (result) => {
  state.signals.unshift(result);
  if (state.signals.length > 20) state.signals.pop();
  renderSignals();
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
});

socket.on('mt5_positions_update', (data) => {
  state.mt5.positions = Array.isArray(data) ? data : (data?.positions || []);
  renderMt5Positions();
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

/* ---- Init ---- */
updateStatus(false);
