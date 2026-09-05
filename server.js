import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import eventBus, { SIGNAL_EVENT, EVENT_UPDATE_EVENT, ERROR_EVENT } from './services/eventBus.js';
import { calendarService } from './services/calendar.js';
import { analyzer } from './services/analyzer.js';
import { tradeService } from './services/tradeService.js';
import { accountService } from './services/accountService.js';

const serverStartTime = new Date().toISOString();
import { marketService } from './services/marketService.js';
import { positionService } from './services/positionService.js';
import LiveDataService, { getLiveDataService } from './services/liveDataService.js';
import { tradeLogger } from './services/tradeLogger.js';
import { tradingLoop } from './services/tradingLoop.js';
import { pairManager } from './services/pairManager.js';
import { opportunityManager } from './services/opportunityManager.js';
import { initStrategyState } from './services/strategyState.js';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  app.use(express.json());

  // Disable ALL caching to ensure fresh data in browser
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use(express.static(path.join(__dirname, 'web'), {
    maxAge: 0,
    etag: false,
    setHeaders: (res) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    },
  }));

  // Public endpoints (no auth required)
  app.get('/api/strategies/states', async (req, res) => {
    try {
      const { getAllStrategyStates } = await import('./services/strategyState.js');
      const states = getAllStrategyStates();
      res.json(states);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategies/scan', async (req, res) => {
    try {
      const { opportunityManager } = await import('./services/opportunityManager.js');
      // Force scan by resetting lastScan
      opportunityManager.lastScan = 0;
      await opportunityManager.scanAll();
      const { getAllStrategyStates } = await import('./services/strategyState.js');
      const states = getAllStrategyStates();
      res.json({ success: true, strategies: states });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/strategies/instruments', async (req, res) => {
    try {
      const { getAvailableInstruments } = await import('./services/strategyState.js');
      const instruments = getAvailableInstruments();
      res.json(instruments);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategies/:strategy/symbols', async (req, res) => {
    try {
      const { strategy } = req.params;
      const { symbols } = req.body;
      const { updateStrategyAllowedSymbols, getAllStrategyStates } = await import('./services/strategyState.js');

      // Update strategy state
      updateStrategyAllowedSymbols(strategy.toUpperCase(), symbols);

      // Also update the actual strategy file
      const strategies = {
        SCALPING: './services/strategies/scalping.js',
        SNIPER: './services/strategies/sniper.js',
        TREND: './services/strategies/trend.js',
        BREAKOUT: './services/strategies/breakout.js',
        REVERSAL: './services/strategies/reversal.js',
        MOMENTUM: './services/strategies/momentum.js',
        RANGE: './services/strategies/range.js',
        ASIAN_LIQUIDITY_SWEEP: './services/strategies/asianLiquiditySweep.js',
        SWEEP_EA: './services/strategies/sweepEA.js',
      };

      const states = getAllStrategyStates();
      const state = states.find(s => s.strategy === strategy.toUpperCase());

      res.json({ success: true, strategy: strategy.toUpperCase(), symbols, state });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api', authMiddleware);

  function authMiddleware(req, res, next) {
    if (!config.dashboardAuth?.enabled) return next();
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (token && token === config.dashboardAuth.token) return next();
    return res.status(401).json({ error: 'Unauthorized' });
  }

  function socketAuth(socket, next) {
    if (!config.dashboardAuth?.enabled) return next();
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token === config.dashboardAuth.token) return next();
    return next(new Error('Unauthorized'));
  }

  io.use(socketAuth);

  // ---- API Routes ----

  app.get('/api/events', async (req, res) => {
    try {
      const events = await calendarService.fetchAll();
      const upcoming = calendarService.getUpcomingEvents(events, 50);
      const today = calendarService.getTodayEvents(events);
      const historical = calendarService.getHistoricalEvents(events, 50);
      res.json({ events, upcoming, today, historical });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/upcoming', async (req, res) => {
    try {
      const events = await calendarService.fetchUpcoming(7);
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/historical', async (req, res) => {
    try {
      const days = parseInt(req.query.days || '3', 10);
      const events = await calendarService.fetchAll();
      const historical = calendarService.getHistoricalEvents(events, 100);
      res.json(historical);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/today', async (req, res) => {
    try {
      const events = await calendarService.fetchToday();
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/history', (req, res) => {
    res.json(analyzer.history || []);
  });

  app.get('/api/history/:category', (req, res) => {
    const perf = analyzer.analyzeHistoricalPerformance(req.params.category);
    res.json(perf || { error: 'No data' });
  });

  app.get('/api/settings', (req, res) => {
    res.json({
      riskPercent: parseFloat(process.env.RISK_PERCENT || '1'),
      ocoEnabled: process.env.OCO_ENABLED !== 'false',
      maxOpenTrades: parseInt(process.env.MAX_OPEN_TRADES || '3', 10),
      dailyLossLimit: parseFloat(process.env.DAILY_LOSS_LIMIT || '50'),
    });
  });

  app.post('/api/settings', (req, res) => {
    const valid = ['riskPercent', 'ocoEnabled', 'maxOpenTrades', 'dailyLossLimit'];
    for (const key of valid) {
      if (req.body[key] !== undefined) {
        process.env[key.toUpperCase()] = String(req.body[key]);
      }
    }
    res.json({ success: true });
  });

  app.get('/api/currencies', (req, res) => {
    res.json({
      currencyPairs: {
        USD: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'XAUUSD', 'XAGUSD', 'BTCUSD'],
        EUR: ['EURUSD', 'EURGBP', 'EURJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD'],
        GBP: ['GBPUSD', 'EURGBP', 'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD'],
        JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'NZDJPY', 'CADJPY', 'CHFJPY'],
        AUD: ['AUDUSD', 'AUDJPY', 'EURAUD', 'GBPAUD', 'AUDNZD', 'AUDCAD', 'AUDCHF'],
        NZD: ['NZDUSD', 'AUDNZD', 'NZDJPY', 'EURNZD', 'GBPNZD', 'NZDCAD', 'NZDCHF'],
        CAD: ['USDCAD', 'CADJPY', 'EURCAD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'CADCHF'],
        CHF: ['USDCHF', 'EURCHF', 'GBPCHF', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY'],
      },
    });
  });

  app.get('/api/performance', async (req, res) => {
    const categories = ['NFP', 'CPI', 'PPI', 'PMI', 'Jobless Claims', 'GDP', 'Retail Sales', 'FOMC', 'Interest Rate'];
    const results = categories.map(cat => analyzer.analyzeHistoricalPerformance(cat)).filter(Boolean);
    res.json(results);
  });

  app.get('/api/trades', (req, res) => {
    try {
      const status = req.query.status || null;
      const symbol = req.query.symbol || null;
      let trades = tradeLogger.getTrades(status);
      if (symbol) {
        trades = trades.filter((t) => (t.symbol || '') === symbol);
      }
      res.json(trades);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/trading-mode/pause', (req, res) => {
    try {
      config.tradingMode.paused = true;
      res.json({ success: true, message: 'Trading paused', paused: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/trading-mode/resume', (req, res) => {
    try {
      config.tradingMode.paused = false;
      res.json({ success: true, message: 'Trading resumed', paused: false });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/trading-mode/emergency', (req, res) => {
    try {
      const { action } = req.body;
      if (action === 'close') {
        config.tradingMode.emergencyClose = true;
        res.json({ success: true, message: 'Emergency close activated', emergencyClose: true });
      } else if (action === 'reset') {
        config.tradingMode.emergencyClose = false;
        res.json({ success: true, message: 'Emergency close reset', emergencyClose: false });
      } else {
        res.status(400).json({ error: 'action must be "close" or "reset"' });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/trading-mode/status', (req, res) => {
    res.json({
      mode: config.tradingMode.mode,
      enabled: config.tradingMode.enabled,
      paused: config.tradingMode.paused,
      emergencyClose: config.tradingMode.emergencyClose,
    });
  });

  // ---- MT5 MCP Routes ----

  app.post('/api/mock-event', (req, res) => {
    try {
      const event = req.body;
      if (!event || !event.id) {
        return res.status(400).json({ error: 'Event id is required' });
      }
      calendarService.addMockEvent(event);
      res.json({ success: true, message: `Mock event ${event.id} injected` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', startTime: serverStartTime });
  });

  app.get('/api/mt5/health', async (req, res) => {
    try {
      const health = await tradeService.healthCheck();
      res.json({
        status: health?.status || 'DISCONNECTED',
        connected: !!health && health.status === 'connected',
        stats: health || {},
        tools: [],
        tradingMode: config.tradingMode.mode,
        tradingEnabled: config.tradingMode.enabled,
        primarySymbol: config.primarySymbol,
        risk: config.risk,
      });
    } catch (err) {
      res.status(500).json({ status: 'ERROR', error: err.message });
    }
  });

  app.get('/api/mt5/account', async (req, res) => {
    try {
      const info = await accountService.getAccountInfo();
      res.json(info);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pairs', async (req, res) => {
    try {
      const supported = pairManager.getSupportedPairs();
      const selected = pairManager.getSelectedPairs();
      const details = [];
      for (const id of Object.keys(supported)) {
        const meta = supported[id];
        let snap = null;
        try { snap = await pairManager.getPairSnapshot(id); } catch (e) { snap = { id, available: false, reason: e.message }; }
        details.push({
          id,
          label: meta.label,
          icon: meta.icon,
          assetClass: meta.assetClass,
          category: meta.category,
          selected: selected.includes(id),
          available: !!snap?.available,
          actualSymbol: snap?.actualSymbol || null,
          spec: snap?.spec || null,
          source: snap?.source || null,
        });
      }
      res.json({ supported, selected, details });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pairs', (req, res) => {
    try {
      const pairs = req.body?.pairs;
      if (!Array.isArray(pairs)) return res.status(400).json({ error: 'pairs array required' });
      const selected = pairManager.setSelectedPairs(pairs);
      res.json({ success: true, selected });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/pairs/refresh', async (req, res) => {
    try {
      const { clearResolverCache, resolveAll } = await import('./services/instrumentResolver.js');
      clearResolverCache();
      const all = await resolveAll();
      const detected = Object.fromEntries(Object.entries(all).filter(([, v]) => v).map(([k, v]) => [k, v.actualSymbol]));
      res.json({ success: true, detected });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/pairs/:id/availability', async (req, res) => {
    try { res.json(await pairManager.getPairSnapshot(req.params.id)); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/pairs/:id/alternatives', async (req, res) => {
    try {
      const { suggestAlternatives } = await import('./services/instrumentResolver.js');
      res.json({ id: req.params.id, alternatives: await suggestAlternatives(req.params.id) });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/pairs/:id/news', async (req, res) => {
    try {
      const { newsClassifier } = await import('./services/newsClassifier.js');
      const { calendarService } = await import('./services/calendar.js');
      const events = await calendarService.fetchAll();
      const upcoming = calendarService.getUpcomingEvents(events, 10);
      const classified = upcoming.map((ev) => ({
        id: ev.id, title: ev.title, category: ev.category, currency: ev.currency, impact: ev.impact,
        classification: newsClassifier.classifyEvent(ev, req.params.id),
      }));
      res.json({ id: req.params.id, events: classified });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/pairs/:id/risk', async (req, res) => {
    try {
      const { tradePlanner } = await import('./services/tradePlanner.js');
      const { accountService } = await import('./services/accountService.js');
      const snap = await pairManager.getPairSnapshot(req.params.id);
      const account = await accountService.getAccountInfo();
      const report = tradePlanner.buildRiskReport({
        id: req.params.id,
        spec: snap?.spec,
        account,
        riskPercent: config.risk.maxRiskPerTrade,
        entry: snap?.spec?.ask,
        stopLoss: snap?.spec ? snap.spec.ask - (snap.spec.ask * 0.01) : null,
      });
      res.json(report);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/strategies', (req, res) => {
    try {
      const strategies = [
        { name: 'NEWS', ...config.strategies?.news },
        { name: 'SCALPING', ...config.strategies?.scalping },
        { name: 'SNIPER', ...config.strategies?.sniper },
        { name: 'TREND', ...config.strategies?.trend },
        { name: 'BREAKOUT', ...config.strategies?.breakout },
        { name: 'REVERSAL', ...config.strategies?.reversal },
        { name: 'MOMENTUM', ...config.strategies?.momentum },
        { name: 'RANGE', ...config.strategies?.range },
      ];
      res.json(strategies);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/strategies', (req, res) => {
    try {
      const updates = req.body || {};
      for (const [strategy, settings] of Object.entries(updates)) {
        if (config.strategies[strategy]) {
          config.strategies[strategy] = { ...config.strategies[strategy], ...settings };
        }
      }
      res.json({ success: true, strategies: config.strategies });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/opportunities', async (req, res) => {
    try {
      const { opportunityManager } = await import('./services/opportunityManager.js');
      const opportunities = await opportunityManager.scanAll();
      const ranked = opportunityManager.rank(opportunities);
      const best = opportunityManager.getBestOpportunity();
      res.json({ opportunities: ranked, best, count: ranked.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/analytics/pnl', async (req, res) => {
    try {
      const symbol = (req.query.symbol || '').trim();
      const days = parseInt(req.query.days || '7', 10);
      const base = (process.env.MT5_PYTHON_SERVER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
      let pairs = [];
      try {
        const dealsRes = await fetch(`${base}/deals?days=${encodeURIComponent(days)}${symbol ? '&symbol=' + encodeURIComponent(symbol) : ''}`);
        if (dealsRes.ok) {
          const dealsData = await dealsRes.json();
          const deals = Array.isArray(dealsData.deals) ? dealsData.deals : [];
          const map = new Map();
          for (const d of deals) {
            const sym = (d.symbol || '').replace(/\.(std|m|cash|s)$/i, '');
            if (symbol && sym !== symbol) continue;
            const profit = parseFloat(d.profit || 0);
            if (!map.has(sym)) map.set(sym, { symbol: sym, pl: 0, trades: 0 });
            const p = map.get(sym);
            p.pl += profit;
            p.trades += 1;
          }
          pairs = Array.from(map.values()).map((p, i) => ({
            symbol: p.symbol,
            pl: Math.round(p.pl * 100) / 100,
            plPercent: p.pl ? Math.round((p.pl / Math.abs(p.pl || 1)) * 100) / 100 : 0,
            trades: p.trades,
          }));
        }
      } catch (e) {
        console.warn('[analytics] deals fetch failed:', e.message);
      }
      if (!pairs.length) {
        try {
          const positionsRes = await fetch(`${base}/positions`);
          if (positionsRes.ok) {
            const positionsData = await positionsRes.json();
            const positions = Array.isArray(positionsData.positions) ? positionsData.positions : (Array.isArray(positionsData) ? positionsData : []);
            const map = new Map();
            for (const pos of positions) {
              const sym = (pos.symbol || '').replace(/\.(std|m|cash|s)$/i, '');
              if (symbol && sym !== symbol) continue;
              const profit = parseFloat(pos.profit || 0);
              if (!map.has(sym)) map.set(sym, { symbol: sym, pl: 0, trades: 0 });
              const p = map.get(sym);
              p.pl += profit;
              p.trades += 1;
            }
            pairs = Array.from(map.values()).map((p, i) => ({
              symbol: p.symbol,
              pl: Math.round(p.pl * 100) / 100,
              plPercent: p.pl ? Math.round((p.pl / Math.abs(p.pl || 1)) * 100) / 100 : 0,
              trades: p.trades,
            }));
          }
        } catch (e) {
          console.warn('[analytics] positions fetch failed:', e.message);
        }
      }
      const totalPL = pairs.reduce((s, p) => s + p.pl, 0);
      const sorted = [...pairs].sort((a, b) => b.pl - a.pl);
      const best = sorted[0] || null;
      const worst = sorted[sorted.length - 1] || null;
      const wins = pairs.filter(p => p.pl > 0).length;
      res.json({
        pairs,
        totalPL: Math.round(totalPL * 100) / 100,
        totalPLPercent: pairs.length ? Math.round(pairs.reduce((s, p) => s + p.plPercent, 0) * 100) / 100 : 0,
        winRate: pairs.length ? Math.round((wins / pairs.length) * 100) : 0,
        best,
        worst,
        generatedAt: Date.now(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/regime/:symbol', async (req, res) => {
    try {
      const { getMarketRegime } = await import('./services/strategies/marketRegime.js');
      const regime = await getMarketRegime(req.params.symbol, 'M5', 100);
      res.json(regime);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mt5/market', async (req, res) => {
    try {
      const symbols = await marketService.getMarketWatchSymbols();
      res.json(symbols);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mt5/positions', async (req, res) => {
    try {
      const positions = await positionService.getOpenPositions();
      res.json(positions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/mt5/history', async (req, res) => {
    try {
      const orders = await positionService.getHistoryOrders();
      res.json(orders);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mt5/trade', async (req, res) => {
    try {
      if (config.tradingMode.mode !== 'AUTONOMOUS') {
        return res.status(403).json({ error: 'Trading is only allowed in AUTONOMOUS mode' });
      }
      if (!config.tradingMode.enabled) {
        return res.status(403).json({ error: 'Trading is disabled via TRADING_ENABLED' });
      }
      const { symbol, type, volume, sl, tp, comment } = req.body;
      if (!symbol || !type || !volume) {
        return res.status(400).json({ error: 'symbol, type, and volume are required' });
      }
      const result = await tradeService.sendMarketOrder(symbol, type, volume, sl, tp, comment);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mt5/close', async (req, res) => {
    try {
      const { symbol, position_ticket } = req.body;
      if (!symbol || position_ticket == null) {
        return res.status(400).json({ error: 'symbol and position_ticket are required' });
      }
      const result = await positionService.closePosition(symbol, position_ticket);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mt5/modify', async (req, res) => {
    try {
      const { symbol, position_ticket, sl, tp } = req.body;
      if (!symbol) {
        return res.status(400).json({ error: 'symbol is required' });
      }
      const result = await positionService.modifyPosition(symbol, position_ticket, sl, tp);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/mt5/emergency-close', async (req, res) => {
    try {
      const positions = await positionService.getOpenPositions();
      const results = [];
      for (const pos of positions) {
        try {
          const r = await positionService.closePosition(pos.symbol, pos.ticket || pos.position_id);
          results.push({ ticket: pos.ticket || pos.position_id, result: r });
        } catch (err) {
          results.push({ ticket: pos.ticket || pos.position_id, error: err.message });
        }
      }
      res.json({ closed: results.length, results });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---- Socket.IO real-time ----

  io.on('connection', (socket) => {
    console.log('[Socket.IO] Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('[Socket.IO] Client disconnected:', socket.id);
    });

    socket.on('subscribe_signals', () => {
      socket.join('signals');
    });

    socket.on('subscribe_events', () => {
      socket.room = socket.room || {};
      socket.join('events');
    });

    socket.on('get_history', (cb) => {
      cb(analyzer.history || []);
    });

    socket.on('get_events', async (cb) => {
      try {
        const events = await calendarService.fetchAll();
        const result = {
          all: events,
          upcoming: calendarService.getUpcomingEvents(events, 50),
          todayEvents: calendarService.getTodayEvents(events),
          historical: calendarService.getHistoricalEvents(events, 50),
        };
        cb(result);
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('get_mt5_health', async (cb) => {
      try {
        const health = await tradeService.healthCheck();
        cb({
          status: health?.status || 'DISCONNECTED',
          connected: !!health && health.status === 'connected',
          stats: health || {},
        });
      } catch (err) {
        cb({ status: 'ERROR', error: err.message });
      }
    });

    socket.on('get_mt5_account', async (cb) => {
      try {
        const info = await accountService.getAccountInfo();
        cb(info);
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('get_mt5_positions', async (cb) => {
      try {
        const result = await positionService.getOpenPositions();
        const positions = Array.isArray(result) ? result : (result?.positions || []);
        cb(positions);
      } catch (err) {
        cb({ error: err.message });
      }
    });

    socket.on('get_mt5_market', async (cb) => {
      try {
        const symbols = await marketService.getMarketWatchSymbols();
        cb(symbols);
      } catch (err) {
        cb({ error: err.message });
      }
    });
  });

  // Periodic MT5 health broadcast
  setInterval(async () => {
    try {
      const health = await tradeService.healthCheck();
      io.emit('mt5_health_update', {
        status: health?.status || 'DISCONNECTED',
        connected: !!health && health.status === 'connected',
        stats: health || {},
        tradingMode: config.tradingMode.mode,
        tradingEnabled: config.tradingMode.enabled,
        primarySymbol: config.primarySymbol,
      });
    } catch {
      io.emit('mt5_health_update', {
        status: 'ERROR',
        stats: {},
        tradingMode: config.tradingMode.mode,
        tradingEnabled: config.tradingMode.enabled,
        primarySymbol: config.primarySymbol,
      });
    }
  }, 30000);

  // Periodic strategy state broadcast - DISABLED
  // setInterval(async () => {
  //   try {
  //     const { getAllStrategyStates } = await import('./services/strategyState.js');
  //     const states = getAllStrategyStates();
  //     io.emit('strategy_states', states);
  //   } catch {
  //   }
  // }, 5000);

  const liveData = getLiveDataService(io);
  liveData.start();

  // ---- Live Data Socket.IO events ----

  io.on('connection', (socket) => {
    socket.emit('mt5_live_status', liveData.getStatus());

    socket.on('disconnect', () => {
      // Cleanup if needed
    });
  });

  // ---- Event Bus integration ----

  eventBus.on('events', (data) => {
    io.emit('events_update', data);
  });

  eventBus.on(SIGNAL_EVENT, (signalResult) => {
    io.to('signals').emit(SIGNAL_EVENT, signalResult);
    io.emit('notification', {
      type: 'signal',
      message: `New signal: ${signalResult.event.title}`,
      timestamp: Date.now(),
    });
  });

  eventBus.on(EVENT_UPDATE_EVENT, (eventUpdate) => {
    io.to('events').emit(EVENT_UPDATE_EVENT, eventUpdate);
  });

  eventBus.on(ERROR_EVENT, (err) => {
    io.emit('error', { message: err.message, timestamp: Date.now() });
  });

  return { app, server, io };
}

export default createServer;
