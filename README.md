# News Trader AI - MT5 Python Edition

Autonomous trading assistant connecting to MetaTrader 5 via a Python Flask bridge.

## Architecture

```
Node.js Bot
    |
    | HTTP (REST)
    v
Python Flask Server (localhost:8000)
    |
    | MetaTrader5 Python SDK
    v
MetaTrader 5
    |
    v
Deriv MT5 Demo Account
```

## Prerequisites

- Node.js 18+
- Python 3.9+ with MetaTrader5 package
- MetaTrader 5 running on Windows
- WSL with access to Windows host (if running from WSL)

## Setup

1. Clone or use the existing `news-trader-ai` project.
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Install Python dependencies:
   ```bash
   pip install flask python-dotenv MetaTrader5
   ```
4. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```
5. Set your MT5 account credentials in `.env`:
   ```
   MT5_ACCOUNT=your_account_number
   MT5_PASSWORD=your_password
   MT5_SERVER=your_broker_server
   ```

## Running

1. Start the Python MT5 bridge server (on Windows):
   ```bash
   python mt5-python-server/mt5_trade_server.py
   ```

2. Start the Node.js bot:
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
| `PORT` | Web server port | `3000` |
| `TIMEZONE` | Display timezone | `Africa/Nairobi` |
| `TIMEZONE_OFFSET` | UTC offset hours | `3` |
| `APIFY_API_KEY` | Apify API key for calendar scraping | (required) |
| `APIFY_BASE_URL` | Apify base URL | `https://api.apify.com` |
| `TWELVE_DATA_API_KEY` | TwelveData API key for market data | (required) |
| `TWELVE_DATA_BASE_URL` | TwelveData base URL | `https://api.twelvedata.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | (optional) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID | (optional) |
| `DISCORD_WEBHOOK_URL` | Discord webhook URL | (optional) |
| `MT5_PYTHON_SERVER_URL` | Python bridge server URL | `http://localhost:8000` |
| `MT5_ENABLED` | Enable MT5 notifications | `false` |
| `MT5_ACCOUNT` | MT5 account number | (required for trading) |
| `MT5_PASSWORD` | MT5 account password | (required for trading) |
| `MT5_SERVER` | MT5 broker server | (required for trading) |
| `TRADING_MODE` | OBSERVE, SIGNAL, or AUTONOMOUS | `OBSERVE` |
| `TRADING_ENABLED` | Master trading enable | `false` |
| `PRIMARY_SYMBOL` | Primary trading symbol | `XAUUSD` |
| `MAX_RISK_PER_TRADE` | Max risk % per trade | `1` |
| `MAX_DAILY_LOSS` | Max daily loss % | `3` |
| `MAX_OPEN_TRADES` | Max simultaneous open trades | `3` |
| `MAX_SYMBOL_EXPOSURE` | Max exposure per symbol | `2` |
| `MIN_RISK_REWARD` | Minimum risk/reward ratio | `2` |
| `MAX_SPREAD` | Maximum allowed spread | `9999` |
| `REQUIRE_STOP_LOSS` | Require stop loss | `true` |
| `REQUIRE_TAKE_PROFIT` | Require take profit | `true` |
| `NEWS_LOCK_BEFORE_MINUTES` | Lock trading before news | `5` |
| `NEWS_LOCK_AFTER_MINUTES` | Lock trading after news | `5` |
| `HIGH_IMPACT_NEWS_LOCK` | Lock on high-impact news | `true` |
| `BREAK_EVEN_ENABLED` | Enable break-even | `true` |
| `IMPACT_FILTER` | Event impact filter | `high,medium` |
| `POLL_INTERVAL_SECONDS` | Calendar poll interval | `60` |
| `HOLDING_TIMES` | Default holding times | `5,15,30` |
| `CONFIDENCE_THRESHOLD` | Minimum confidence for signals | `70` |
| `NEWS_BREAKOUT_ENABLED` | Enable news breakout strategy | `false` |
| `NEWS_PRE_ENTRY_SECONDS` | Pre-news entry window | `60` |
| `NEWS_RANGE_LOOKBACK_MINUTES` | Range calculation lookback | `5` |
| `NEWS_BREAKOUT_BUFFER_MULTIPLIER` | ATR buffer multiplier | `0.5` |
| `NEWS_WAIT_FOR_ACTUAL_SECONDS` | Wait for actual value | `30` |
| `NEWS_POST_NEWS_TIMEOUT_SECONDS` | Post-news timeout | `120` |
| `NEWS_MAX_SPREAD` | Max spread for news trades | `3` |
| `NEWS_MAX_SLIPPAGE` | Max slippage | `2` |
| `NEWS_OCO_ENABLED` | Enable OCO orders | `false` |
| `NEWS_COOLDOWN_SECONDS` | Cooldown between news trades | `300` |
| `ACCOUNT_MODE` | Account mode | `MICRO` |
| `ACCOUNT_EXPECTED_LOGIN` | Expected account login | (optional) |
| `ACCOUNT_EXPECTED_SERVER` | Expected server | (optional) |
| `ACCOUNT_EXPECTED_CURRENCY` | Expected currency | `USD` |
| `EXPECTED_BALANCE` | Expected balance | `10` |
| `MAX_DAILY_TRADES` | Max daily trades | `3` |
| `LIVE_DATA_POLL_MS` | Live data poll interval | `2000` |
| `STALE_DATA_MS` | Stale data threshold | `10000` |

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
    tradeService.js     # MT5 Python bridge client (single interface)
    accountService.js   # Account information
    marketService.js    # Market data and symbols
    positionService.js  # Positions and orders
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
  mt5-python-server/
    mt5_trade_server.py # Python Flask bridge to MT5
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mt5/health` | GET | MT5 Python bridge connection status |
| `/api/mt5/account` | GET | Account information |
| `/api/mt5/market` | GET | Market watch symbols |
| `/api/mt5/positions` | GET | Open positions |
| `/api/mt5/history` | GET | Order history |
| `/api/mt5/trade` | POST | Execute trade (AUTONOMOUS only) |
| `/api/mt5/close` | POST | Close position |
| `/api/mt5/modify` | POST | Modify SL/TP |
| `/api/mt5/emergency-close` | POST | Close all positions |

## Known Limitations

- Python MT5 bridge server must be running separately.
- Technical analysis is a placeholder (requires chart history integration).
- News lock window checks are basic.
- Break-even and trailing stop logic is not fully implemented.
- WebSocket real-time updates for MT5 data require polling.
