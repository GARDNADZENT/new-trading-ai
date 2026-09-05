import dotenv from 'dotenv';
dotenv.config();

const selectedInstruments = (process.env.SELECTED_INSTRUMENTS || process.env.SELECTED_PAIRS || 'XAUUSD,EURUSD,GBPUSD,USDJPY,USDCHF,USDCAD,AUDUSD,US30,US100')
  .split(',').map(s => s.trim()).filter(Boolean);

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
    maxSpread: parseFloat(process.env.NEWS_MAX_SPREAD || '20'),
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
  dashboardAuth: {
    token: process.env.DASHBOARD_AUTH_TOKEN || '',
    enabled: !!process.env.DASHBOARD_AUTH_TOKEN,
  },
  selectedInstruments,
  selectedPairs: [...selectedInstruments],
  pairPlanner: {
    XAUUSD: { atrPeriod: 14, slAtrMult: 2, tpAtrMult: 4, maxAtrMult: 3, minRiskReward: 2, lookbackCandles: 60 },
    US30: { atrPeriod: 14, slAtrMult: 1.5, tpAtrMult: 3, maxAtrMult: 2.5, minRiskReward: 2, lookbackCandles: 60 },
    US100: { atrPeriod: 14, slAtrMult: 1.5, tpAtrMult: 3, maxAtrMult: 2.5, minRiskReward: 2, lookbackCandles: 60 },
    USOIL: { atrPeriod: 14, slAtrMult: 2, tpAtrMult: 4, maxAtrMult: 3, minRiskReward: 2, lookbackCandles: 60 },
  },
  currencyPairs: {
    EUR: ['EURUSD', 'EURGBP', 'EURJPY', 'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD'],
    GBP: ['GBPUSD', 'EURGBP', 'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD'],
    JPY: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY', 'NZDJPY', 'CADJPY', 'CHFJPY'],
    AUD: ['AUDUSD', 'AUDJPY', 'EURAUD', 'GBPAUD', 'AUDNZD', 'AUDCAD', 'AUDCHF'],
    NZD: ['NZDUSD', 'AUDNZD', 'NZDJPY', 'EURNZD', 'GBPNZD', 'NZDCAD', 'NZDCHF'],
    CAD: ['USDCAD', 'CADJPY', 'EURCAD', 'GBPCAD', 'AUDCAD', 'NZDCAD', 'CADCHF'],
    CHF: ['USDCHF', 'EURCHF', 'GBPCHF', 'AUDCHF', 'NZDCHF', 'CADCHF', 'CHFJPY'],
  },
  commodities: {
    CAD: ['USDCAD', 'CADJPY', 'AUDCAD', 'NZDCAD'],
    AUD: ['AUDUSD', 'AUDJPY', 'EURAUD', 'GBPAUD', 'AUDNZD', 'AUDCAD', 'AUDCHF'],
    NZD: ['NZDUSD', 'AUDNZD', 'NZDJPY', 'EURNZD', 'GBPNZD', 'NZDCAD', 'NZDCHF'],
  },
  strategies: {
    news: { enabled: true },
    scalping: { enabled: process.env.SCALPING_ENABLED !== 'false', minScore: 70, timeframes: ['M1', 'M5'] },
    sniper: { enabled: process.env.SNIPER_ENABLED !== 'false', minScore: 80, timeframes: ['M5', 'M15', 'H1'] },
    trend: { enabled: process.env.TREND_ENABLED !== 'false', minScore: 70, timeframes: ['H1', 'H4'] },
    breakout: { enabled: process.env.BREAKOUT_ENABLED !== 'false', minScore: 70, timeframes: ['M5', 'M15'] },
    reversal: { enabled: process.env.REVERSAL_ENABLED !== 'false', minScore: 75, timeframes: ['M5', 'M15', 'H1'] },
    momentum: { enabled: process.env.MOMENTUM_ENABLED !== 'false', minScore: 70, timeframes: ['M5', 'M15'] },
    range: { enabled: process.env.RANGE_ENABLED !== 'false', minScore: 70, timeframes: ['M5', 'M15', 'H1'] },
    asianLiquiditySweep: {
      enabled: process.env.ASIAN_LIQUIDITY_SWEEP_ENABLED !== 'false',
      asianSessionStartHour: parseInt(process.env.ASIAN_SESSION_START_HOUR || '0', 10),
      asianSessionEndHour: parseInt(process.env.ASIAN_SESSION_END_HOUR || '8', 10),
      riskPercent: parseFloat(process.env.ASIAN_SWEEP_RISK_PERCENT || '0.5'),
      slBufferPoints: parseInt(process.env.ASIAN_SWEEP_SL_BUFFER || '10', 10),
      slOffsetPoints: parseInt(process.env.ASIAN_SWEEP_SL_OFFSET || '20', 10),
      slMode: parseInt(process.env.ASIAN_SWEEP_SL_MODE || '3', 10),
      useOppositeAsianTP: process.env.ASIAN_SWEEP_USE_OPPOSITE_TP !== 'false',
      obLookbackBars: parseInt(process.env.ASIAN_SWEEP_OB_LOOKBACK || '10', 10),
      swingLookback: parseInt(process.env.ASIAN_SWEEP_SWING_LOOKBACK || '3', 10),
      maxTradesPerDay: parseInt(process.env.ASIAN_SWEEP_MAX_TRADES || '3', 10),
      maxSpreadPoints: parseInt(process.env.ASIAN_SWEEP_MAX_SPREAD || '30', 10),
    },
    sweepEA: {
      enabled: process.env.SWEEP_EA_ENABLED !== 'false',
      targetHour: parseInt(process.env.SWEEP_EA_TARGET_HOUR || '16', 10),
      targetMinute: parseInt(process.env.SWEEP_EA_TARGET_MINUTE || '30', 10),
      waitSeconds: parseInt(process.env.SWEEP_EA_WAIT_SECONDS || '60', 10),
      riskUSD: parseFloat(process.env.SWEEP_EA_RISK_USD || '10'),
      rewardUSD: parseFloat(process.env.SWEEP_EA_REWARD_USD || '3'),
      slPoints: parseInt(process.env.SWEEP_EA_SL_POINTS || '500', 10),
      timeOffset: parseInt(process.env.SWEEP_EA_TIME_OFFSET || '3', 10),
      fixedLotFallback: parseFloat(process.env.SWEEP_EA_FIXED_LOT || '0.01'),
      magic: parseInt(process.env.SWEEP_EA_MAGIC || '202504', 10),
      maxSpread: parseFloat(process.env.SWEEP_EA_MAX_SPREAD || '50'),
      // Note: Fires at the NEXT minute after target time (e.g., 10:30 target → 10:31:00 execution)
    },
  },
};

export default config;
