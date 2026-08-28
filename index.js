import { createServer } from './server.js';
import { startWatcher } from './services/scheduler.js';
import { tradingLoop } from './services/tradingLoop.js';
import { mt5MCP } from './services/mt5MCP.js';
import { twelveDataService } from './services/twelveData.js';
import { apifyService } from './services/apify.js';
import config from './config.js';

const PORT = process.env.PORT || 3000;

console.log('========================================');
console.log('     News Trader AI - Starting Bot       ');
console.log('========================================');
console.log('');

const { server } = createServer();

async function bootstrap() {
  if (config.mt5MCP?.apiKey || process.env.MT5_MCP_KEY) {
    console.log('[MT5 MCP] Initializing connection...');
    const connected = await mt5MCP.initialize();
    if (connected) {
      console.log(`[MT5 MCP] Connected. Tools available: ${mt5MCP.getToolNames().length}`);
    } else {
      console.warn(`[MT5 MCP] Connection failed: ${mt5MCP.lastError}`);
    }
  } else {
    console.warn('[MT5 MCP] No API key configured. Set MT5_MCP_KEY in .env');
  }

  server.listen(PORT, () => {
    console.log(`[Web] Dashboard available at http://localhost:${PORT}`);

    if (config.calendar?.twelveData?.apiKey || process.env.TWELVE_DATA_API_KEY) {
      console.log('[TwelveData] Market data service ready');
    } else {
      console.warn('[TwelveData] No API key configured. Set TWELVE_DATA_API_KEY in .env');
    }

    if (config.calendar?.apify?.apiKey || process.env.APIFY_API_KEY) {
      console.log('[Apify] Scraping service ready');
    } else {
      console.warn('[Apify] No API key configured. Set APIFY_API_KEY in .env');
    }

    if (config.tradingMode.mode === 'AUTONOMOUS' && config.tradingMode.enabled) {
      console.log('[Trading] AUTONOMOUS mode ENABLED');
      tradingLoop.start();
    } else {
      console.log(`[Trading] Mode: ${config.tradingMode.mode} | Enabled: ${config.tradingMode.enabled}`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Web] Port ${PORT} is already in use. Try: lsof -ti:${PORT} | xargs kill -9`);
    } else {
      console.error('[Web] Server error:', err);
    }
  });

  process.on('SIGINT', () => {
    console.log('\n[Web] Shutting down...');
    server.close(() => process.exit(0));
  });

  startWatcher().catch(err => {
    console.error('Fatal error starting bot:', err);
    process.exit(1);
  });
}

bootstrap().catch(err => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});

export { server };
