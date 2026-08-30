import dotenv from 'dotenv';
dotenv.config();

const config = {
  timezone: {
    display: process.env.TIMEZONE || 'Africa/Nairobi',
    offsetHours: parseInt(process.env.TIMEZONE_OFFSET || '3', 10),
  },
  calendar: {
    apify: {
      apiKey: process.env.APIFY_API_KEY,
      baseUrl: process.env.APIFY_BASE_URL || 'https://api.apify.com',
    },
    twelveData: {
      apiKey: process.env.TWELVE_DATA_API_KEY,
      baseUrl: process.env.TWELVE_DATA_BASE_URL || 'https://api.twelvedata.com',
    },
  },
  notifications: {
    telegram: {
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    },
    discord: {
      enabled: !!process.env.DISCORD_WEBHOOK_URL,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL,
    },
    mt5: {
      enabled: process.env.MT5_ENABLED === 'true',
      account: process.env.MT5_ACCOUNT,
      password: process.env.MT5_PASSWORD,
      server: process.env.MT5_SERVER,
    },
  },
  trading: {
    impactFilter: (process.env.IMPACT_FILTER || 'high,medium').split(','),
    pollIntervalMs: (parseInt(process.env.POLL_INTERVAL_SECONDS || '60', 10)) * 1000,
    releasePollIntervalMs: 5000,
    holdingTimes: (process.env.HOLDING_TIMES || '5,15,30').split(',').map(Number),
    confidenceThreshold: parseInt(process.env.CONFIDENCE_THRESHOLD, 10) || 70,
  },
  liveData: {
    pollIntervalMs: parseInt(process.env.LIVE_DATA_POLL_MS || '2000', 10),
    staleThresholdMs: parseInt(process.env.STALE_DATA_MS || '10000', 10),
  },
  mt5Python: {
    url: process.env.MT5_PYTHON_SERVER_URL || 'http://localhost:8000',
  },
  tradingMode: {
    mode: (process.env.TRADING_MODE || 'OBSERVE').toUpperCase(),
    enabled: process.env.TRADING_ENABLED === 'true',
    emergencyClose: false,
    paused: false,
  },
  risk: {
    maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE || '1'),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '3'),
    maxOpenTrades: parseInt(process.env.MAX_OPEN_TRADES || '3', 10),
    maxSymbolExposure: parseFloat(process.env.MAX_SYMBOL_EXPOSURE || '2'),
    minRiskReward: parseFloat(process.env.MIN_RISK_REWARD || '2'),
    maxSpread: parseFloat(process.env.MAX_SPREAD || '9999'),
    requireStopLoss: process.env.REQUIRE_STOP_LOSS !== 'false',
    requireTakeProfit: process.env.REQUIRE_TAKE_PROFIT !== 'false',
    newsLockBeforeMinutes: parseInt(process.env.NEWS_LOCK_BEFORE_MINUTES || '5', 10),
    newsLockAfterMinutes: parseInt(process.env.NEWS_LOCK_AFTER_MINUTES || '5', 10),
    highImpactNewsLock: process.env.HIGH_IMPACT_NEWS_LOCK !== 'false',
    breakEvenEnabled: process.env.BREAK_EVEN_ENABLED !== 'false',
  },
  newsBreakout: {
    enabled: process.env.NEWS_BREAKOUT_ENABLED === 'true',
    preEntrySeconds: parseInt(process.env.NEWS_PRE_ENTRY_SECONDS || '60', 10),
    rangeLookbackMinutes: parseInt(process.env.NEWS_RANGE_LOOKBACK_MINUTES || '5', 10),
    breakoutBufferMode: process.env.NEWS_BREAKOUT_BUFFER_MODE || 'atr',
    breakoutBufferMin: parseFloat(process.env.NEWS_BREAKOUT_BUFFER_MIN || '0.5'),
    breakoutBufferMax: parseFloat(process.env.NEWS_BREAKOUT_BUFFER_MAX || '5'),
    breakoutBufferMultiplier: parseFloat(process.env.NEWS_BREAKOUT_BUFFER_MULTIPLIER || '0.5'),
    waitForActualSeconds: parseInt(process.env.NEWS_WAIT_FOR_ACTUAL_SECONDS || '30', 10),
    postNewsTimeoutSeconds: parseInt(process.env.NEWS_POST_NEWS_TIMEOUT_SECONDS || '120', 10),
    maxSpread: parseFloat(process.env.NEWS_MAX_SPREAD || '3'),
    maxSlippage: parseFloat(process.env.NEWS_MAX_SLIPPAGE || '2'),
    volatilityLimit: parseFloat(process.env.NEWS_VOLATILITY_LIMIT || '0.02'),
    confirmationRequired: process.env.NEWS_CONFIRMATION_REQUIRED !== 'false',
    ocoEnabled: process.env.NEWS_OCO_ENABLED !== 'false',
    cooldownSeconds: parseInt(process.env.NEWS_COOLDOWN_SECONDS || '300', 10),
  },
  account: {
    mode: (process.env.ACCOUNT_MODE || 'MICRO').toUpperCase(),
    expectedLogin: process.env.ACCOUNT_EXPECTED_LOGIN ? parseInt(process.env.ACCOUNT_EXPECTED_LOGIN, 10) : null,
    expectedServer: process.env.ACCOUNT_EXPECTED_SERVER || null,
    expectedCurrency: process.env.ACCOUNT_EXPECTED_CURRENCY || 'USD',
    expectedBalance: parseFloat(process.env.EXPECTED_BALANCE || '10'),
    maxRiskPerTrade: parseFloat(process.env.MAX_RISK_PER_TRADE || '1'),
    maxOpenTrades: parseInt(process.env.MAX_OPEN_TRADES || '1', 10),
    maxDailyLoss: parseFloat(process.env.MAX_DAILY_LOSS || '5'),
    maxDailyTrades: parseInt(process.env.MAX_DAILY_TRADES || '3', 10),
  },
  primarySymbol: process.env.PRIMARY_SYMBOL || 'XAUUSD',
  supportedPairs: {
    XAUUSD: { name: 'XAUUSD', label: 'Gold / US Dollar', icon: '🥇', base: 'XAUUSD' },
    BTCUSD: { name: 'BTCUSD', label: 'Bitcoin / US Dollar', icon: '₿', base: 'BTCUSD' },
  },
  selectedPairs: (process.env.SELECTED_PAIRS || 'XAUUSD,BTCUSD').split(',').map(s => s.trim()).filter(Boolean),
  pairPlanner: {
    XAUUSD: { atrPeriod: 14, slAtrMult: 2, tpAtrMult: 4, maxAtrMult: 3, minRiskReward: 2, lookbackCandles: 60 },
    BTCUSD: { atrPeriod: 14, slAtrMult: 2.5, tpAtrMult: 5, maxAtrMult: 4, minRiskReward: 2, lookbackCandles: 60 },
  },
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
  commodities: {
    USD: ['XAUUSD', 'XAGUSD', 'BTCUSD', 'USOIL', 'UKOIL', 'US30', 'US100', 'SPX500', 'DXY'],
    CAD: ['USDCAD', 'CADJPY', 'AUDCAD', 'NZDCAD'],
    AUD: ['AUDUSD', 'AUDJPY', 'EURAUD', 'GBPAUD', 'AUDNZD', 'AUDCAD', 'AUDCHF'],
    NZD: ['NZDUSD', 'AUDNZD', 'NZDJPY', 'EURNZD', 'GBPNZD', 'NZDCAD', 'NZDCHF'],
  },
};

export default config;
