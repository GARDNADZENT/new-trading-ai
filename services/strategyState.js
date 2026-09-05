/**
 * Strategy State Tracker
 *
 * Tracks the real-time state of each strategy:
 * - What it's currently waiting for
 * - Last scan time
 * - Last opportunity found
 */

const strategyStates = new Map();

const STRATEGY_DEFINITIONS = {
  ASIAN_LIQUIDITY_SWEEP: {
    name: 'Asian Liquidity Sweep',
    description: 'Waits for Asian session sweep + BOS + Order Block + Mitigation',
    allowedSymbols: ['EURUSD'],
    phases: [
      'Waiting for Asian session',
      'Waiting for sweep (HIGH/LOW)',
      'Waiting for BOS on M5',
      'Waiting for Order Block',
      'Waiting for M1 mitigation',
      'Waiting for market integrity',
    ],
  },
SWEEP_EA: {
    name: 'SweepEA',
    description: 'Daily time-based trade at 16:30',
    allowedSymbols: ['US30', 'US100'],
    phases: [
      'Waiting for 16:30 target time...',
      'Candle closed - executing trade',
      'Trade executed',
    ],
  },
  SNIPER: {
    name: 'Sniper',
    description: 'Waits for strong trend + MA alignment + RSI healthy',
    allowedSymbols: ['XAUUSD', 'XAGUSD'],
    phases: [
      'Waiting for strong trend',
      'Waiting for MA alignment',
      'Waiting for RSI healthy zone',
      'Waiting for volatility',
      'Waiting for market integrity',
    ],
  },
  BREAKOUT: {
    name: 'Breakout',
    description: 'Waits for consolidation + breakout + volatility expansion',
    allowedSymbols: ['XAUUSD', 'EURUSD'],
    phases: [
      'Waiting for consolidation',
      'Waiting for breakout',
      'Waiting for volatility expansion',
      'Waiting for market integrity',
    ],
  },
  MOMENTUM: {
    name: 'Momentum',
    description: 'Waits for momentum + MA stack + RSI momentum',
    allowedSymbols: ['XAUUSD'],
    phases: [
      'Waiting for momentum',
      'Waiting for MA stack',
      'Waiting for RSI momentum',
      'Waiting for volatility expansion',
      'Waiting for market integrity',
    ],
  },
  RANGE: {
    name: 'Range',
    description: 'Waits for price at range bounds with rejection',
    allowedSymbols: ['XAUUSD'],
    phases: [
      'Waiting for range formation',
      'Waiting for price at range high',
      'Waiting for price at range low',
      'Waiting for market integrity',
    ],
  },
  REVERSAL: {
    name: 'Reversal',
    description: 'Waits for oversold/overbounce + RSI extreme',
    allowedSymbols: ['XAUUSD', 'EURUSD'],
    phases: [
      'Waiting for trend',
      'Waiting for RSI extreme',
      'Waiting for price at extreme',
      'Waiting for market integrity',
    ],
  },
  SCALPING: {
    name: 'Scalping',
    description: 'Waits for EMA trend + RSI neutral + low spread',
    allowedSymbols: ['XAUUSD'],
    phases: [
      'Waiting for spread to normalize',
      'Waiting for EMA trend',
      'Waiting for RSI neutral',
      'Waiting for market integrity',
    ],
  },
  TREND: {
    name: 'Trend',
    description: 'Waits for trend + MA alignment + pullback',
    allowedSymbols: ['XAUUSD'],
    phases: [
      'Waiting for trend',
      'Waiting for MA alignment',
      'Waiting for pullback',
      'Waiting for market integrity',
    ],
  },
};

export function initStrategyState(strategyName) {
  if (!STRATEGY_DEFINITIONS[strategyName]) return null;

  const state = {
    strategy: strategyName,
    displayName: STRATEGY_DEFINITIONS[strategyName].name,
    description: STRATEGY_DEFINITIONS[strategyName].description,
    allowedSymbols: [...STRATEGY_DEFINITIONS[strategyName].allowedSymbols],
    currentPhase: 0,
    phases: STRATEGY_DEFINITIONS[strategyName].phases,
    status: 'SCANNING',
    lastScanTime: null,
    lastOpportunity: null,
    symbols: [...STRATEGY_DEFINITIONS[strategyName].allowedSymbols],
    error: null,
  };

  strategyStates.set(strategyName, state);
  return state;
}

export function updateStrategyState(strategyName, update) {
  const state = strategyStates.get(strategyName);
  if (!state) return null;

  if (update.phase !== undefined) {
    state.currentPhase = update.phase;
  }
  if (update.status) {
    state.status = update.status;
  }
  if (update.lastScanTime !== undefined) {
    state.lastScanTime = update.lastScanTime;
  }
  if (update.lastOpportunity) {
    state.lastOpportunity = update.lastOpportunity;
  }
  if (update.symbol) {
    if (!state.symbols.includes(update.symbol)) {
      state.symbols.push(update.symbol);
    }
  }
  if (update.error) {
    state.error = update.error;
  }

  return state;
}

export function setStrategyWaiting(strategyName, phase, symbol) {
  return updateStrategyState(strategyName, {
    phase,
    status: 'WAITING',
    lastScanTime: Date.now(),
    symbol,
  });
}

export function setStrategyOpportunity(strategyName, opportunity) {
  return updateStrategyState(strategyName, {
    status: 'OPPORTUNITY',
    lastOpportunity: {
      symbol: opportunity.symbol,
      direction: opportunity.direction,
      score: opportunity.score,
      timestamp: Date.now(),
    },
  });
}

export function setStrategyError(strategyName, error) {
  return updateStrategyState(strategyName, {
    status: 'ERROR',
    error: error.message || String(error),
  });
}

export function getStrategyState(strategyName) {
  return strategyStates.get(strategyName) || null;
}

export function getAllStrategyStates() {
  const states = [];
  for (const [name, state] of strategyStates) {
    states.push({ ...state });
  }
  return states;
}

export function getStrategyPhases(strategyName) {
  return STRATEGY_DEFINITIONS[strategyName]?.phases || [];
}

export function getAllStrategyDefinitions() {
  return { ...STRATEGY_DEFINITIONS };
}

export function resetAllStates() {
  for (const [name, state] of strategyStates) {
    state.currentPhase = 0;
    state.status = 'SCANNING';
    state.lastScanTime = null;
    state.error = null;
    state.symbols = [...state.allowedSymbols];
  }
}

export function updateStrategyAllowedSymbols(strategyName, symbols) {
  const state = strategyStates.get(strategyName);
  if (!state) return null;

  state.allowedSymbols = [...symbols];
  state.symbols = [...symbols];
  return state;
}

// All available instruments from broker (will be populated dynamically)
let availableInstruments = {
  metals: ['XAUUSD', 'XAGUSD'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY'],
  indices: ['US30', 'US100', 'US500', 'UK100', 'GER40', 'JP225', 'AUS200'],
  energy: ['USOIL', 'UKOIL'],
};

export function setAvailableInstruments(instruments) {
  availableInstruments = { ...availableInstruments, ...instruments };
}

export function getAvailableInstruments() {
  return { ...availableInstruments };
}

export function getAllAvailableSymbols() {
  return [
    ...availableInstruments.metals,
    ...availableInstruments.forex,
    ...availableInstruments.indices,
    ...availableInstruments.energy,
  ];
}

export default {
  initStrategyState,
  updateStrategyState,
  setStrategyWaiting,
  setStrategyOpportunity,
  setStrategyError,
  getStrategyState,
  getAllStrategyStates,
  getStrategyPhases,
  getAllStrategyDefinitions,
  resetAllStates,
  updateStrategyAllowedSymbols,
  setAvailableInstruments,
  getAvailableInstruments,
  getAllAvailableSymbols,
};
