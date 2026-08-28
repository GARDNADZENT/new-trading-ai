# News Trader AI - MT5 MCP Edition

Autonomous trading assistant connecting Kilo Code to MetaTrader 5 via the built-in MT5 MCP server.

## Architecture

```
Kilo Code
    |
    | MCP (Bearer auth)
    v
MetaTrader 5 Built-in MCP (127.0.0.1:22346/mcp)
    |
    v
MetaTrader 5
    |
    v
Deriv MT5 Demo Account
```

## Prerequisites

- Node.js 18+
- MetaTrader 5 running on Windows with MCP server enabled
- MT5 MCP API key
- WSL with access to Windows host (127.0.0.1:22346)

## Setup

1. Clone or use the existing `news-trader-ai` project.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```
4. Set the MT5 MCP key:
   ```bash
   export MT5_MCP_KEY=your_key_here
   ```
   Or add it to `.env`:
   ```
   MT5_MCP_KEY=your_key_here
   ```

## Running

```bash
npm start
```

Dashboard: http://localhost:3000

## Trading Modes

| Mode | Description |
|------|-------------|
| OBSERVE | Read-only. Displays account, market, and news data. No trades. |
| SIGNAL | Generates trade signals but does not execute. |
| AUTONOMOUS | Generates, validates, and executes trades automatically. |

Configure via `.env`:
```
TRADING_MODE=OBSERVE
TRADING_ENABLED=false
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MT5_MCP_URL` | MT5 MCP endpoint | `http://127.0.0.1:22346/mcp` |
| `MT5_MCP_KEY` | Bearer token for MT5 MCP | (required) |
| `TRADING_MODE` | OBSERVE, SIGNAL, or AUTONOMOUS | `OBSERVE` |
| `TRADING_ENABLED` | Enable/disable trading | `false` |
| `PRIMARY_SYMBOL` | Primary trading symbol | `XAUUSD` |
| `MAX_RISK_PER_TRADE` | Max risk per trade (%) | `1` |
| `MAX_DAILY_LOSS` | Max daily loss (%) | `3` |
| `MAX_OPEN_TRADES` | Max simultaneous open trades | `3` |
| `MIN_RISK_REWARD` | Minimum risk/reward ratio | `2` |
| `NEWS_LOCK_BEFORE_MINUTES` | Lock before high-impact news | `5` |
| `NEWS_LOCK_AFTER_MINUTES` | Lock after high-impact news | `5` |

## Testing

```bash
npm test
# or
node tests/lotCalculator.test.js
```

## Safety

- **DEMO ONLY**: Test exclusively on Deriv DEMO accounts.
- Trading is disabled by default (`TRADING_ENABLED=false`).
- Risk engine validates every trade before execution.
- API keys are read from environment variables only.
- `.env` is gitignored.

## Project Structure

```
news-trader-ai/
  index.js              # Application entry point
  server.js             # Express + Socket.IO server
  config.js             # Configuration management
  services/
    mt5MCP.js           # MT5 MCP protocol client
    accountService.js   # Account information
    marketService.js    # Market data and symbols
    positionService.js  # Positions and orders
    tradeService.js     # Trade execution
    riskEngine.js       # Risk validation
    lotCalculator.js    # Position sizing
    signalEngine.js     # Trade signal generation
    calendar.js         # Economic calendar
    analyzer.js         # News analysis
    eventBus.js         # Event system
    newsWatcher.js      # News monitoring loop
    tradingLoop.js      # Autonomous trading loop
    tradeLogger.js      # Trade journal
  web/
    index.html          # Dashboard UI
    app.js              # Dashboard logic
    style.css           # Dashboard styles
  rules/
    usd.js, eur.js, ... # Currency-specific rules
  tests/
    lotCalculator.test.js
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mt5/health` | GET | MT5 MCP connection status |
| `/api/mt5/account` | GET | Account information |
| `/api/mt5/market` | GET | Market watch symbols |
| `/api/mt5/positions` | GET | Open positions |
| `/api/mt5/history` | GET | Order history |
| `/api/mt5/trade` | POST | Execute trade (AUTONOMOUS only) |
| `/api/mt5/close` | POST | Close position |
| `/api/mt5/modify` | POST | Modify SL/TP |
| `/api/mt5/emergency-close` | POST | Close all positions |

## Known Limitations

- MT5 MCP key must be configured manually.
- Technical analysis is a placeholder (requires chart history integration).
- News lock window checks are basic.
- Break-even and trailing stop logic is not fully implemented.
- WebSocket real-time updates for MT5 data require polling.
