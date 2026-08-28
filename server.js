import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import eventBus, { SIGNAL_EVENT, EVENT_UPDATE_EVENT, ERROR_EVENT } from './services/eventBus.js';
import { calendarService } from './services/calendar.js';
import { analyzer } from './services/analyzer.js';
import { mt5MCP } from './services/mt5MCP.js';
import { accountService } from './services/accountService.js';
import { marketService } from './services/marketService.js';
import { positionService } from './services/positionService.js';
import { tradeService } from './services/tradeService.js';
import LiveDataService, { getLiveDataService } from './services/liveDataService.js';
import { tradeLogger } from './services/tradeLogger.js';
import { tradingLoop } from './services/tradingLoop.js';
import config from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'web')));

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
      impactFilter: process.env.IMPACT_FILTER || 'high,medium',
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10) * 1000,
      confidenceThreshold: parseInt(process.env.CONFIDENCE_THRESHOLD || '70', 10),
      telegramEnabled: !!process.env.TELEGRAM_BOT_TOKEN,
      discordEnabled: !!process.env.DISCORD_WEBHOOK_URL,
      mt5Enabled: process.env.MT5_ENABLED === 'true',
    });
  });

  app.post('/api/settings', (req, res) => {
    const valid = ['impactFilter', 'pollIntervalSeconds', 'confidenceThreshold'];
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
        USD: ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'XAUUSD', 'XAGUSD'],
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
      const trades = tradeLogger.getTrades(status);
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

  app.get('/api/mt5/health', async (req, res) => {
    try {
      const connected = await mt5MCP.initialize();
      res.json({
        status: mt5MCP.getStatus(),
        connected,
        stats: mt5MCP.getStats(),
        tools: mt5MCP.getToolNames(),
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
        const connected = await mt5MCP.initialize();
        cb({
          status: mt5MCP.getStatus(),
          connected,
          stats: mt5MCP.getStats(),
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
      await mt5MCP.initialize();
      io.emit('mt5_health_update', {
        status: mt5MCP.getStatus(),
        stats: mt5MCP.getStats(),
        tradingMode: config.tradingMode.mode,
        tradingEnabled: config.tradingMode.enabled,
        primarySymbol: config.primarySymbol,
      });
    } catch {
      io.emit('mt5_health_update', {
        status: 'ERROR',
        stats: mt5MCP.getStats(),
      });
    }
  }, 30000);

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
