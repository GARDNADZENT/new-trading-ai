import fs from 'fs';
import path from 'path';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);

const LOG_DIR = path.resolve('logs');
const JOURNAL_FILE = path.join(LOG_DIR, 'trade-journal.json');

class TradeLogger {
  constructor() {
    this.journal = [];
    this.load();
  }

  load() {
    if (fs.existsSync(JOURNAL_FILE)) {
      try {
        this.journal = JSON.parse(fs.readFileSync(JOURNAL_FILE, 'utf8'));
      } catch {
        this.journal = [];
      }
    }
  }

  save() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(JOURNAL_FILE, JSON.stringify(this.journal, null, 2));
  }

  logTrade(record) {
    const entry = {
      ...record,
      loggedAt: dayjs().utc().format(),
    };
    this.journal.push(entry);
    if (this.journal.length > 5000) this.journal.shift();
    this.save();
    return entry;
  }

  logSignal(signal) {
    return this.logTrade({
      type: 'SIGNAL',
      symbol: signal.symbol,
      direction: signal.direction,
      entry: signal.entry,
      stop_loss: signal.stop_loss,
      take_profit: signal.take_profit,
      lot_size: signal.lot_size,
      risk_percent: signal.risk_percent,
      risk_amount: signal.risk_amount,
      risk_reward: signal.risk_reward,
      confidence: signal.confidence,
      reason: signal.fundamental_reason,
    });
  }

  logExecution(result) {
    const execution = result.executionResult || result;
    const entry = {
      type: 'EXECUTION',
      symbol: result.symbol,
      direction: result.direction,
      lot_size: result.lot_size,
      stop_loss: result.stop_loss,
      take_profit: result.take_profit,
      entry: result.entry,
      confidence: result.confidence,
      fundamental_reason: result.fundamental_reason,
      technical_reason: result.technical_reason,
      news_reason: result.news_reason,
      risk_percent: result.risk_percent,
      risk_amount: result.risk_amount,
      risk_reward: result.risk_reward,
      ticket: execution.ticket || null,
      retcode: execution.retcode || null,
      comment: execution.comment || null,
      success: execution.success || false,
      error: execution.error || null,
      account: result.account || null,
      eventId: result.eventId || null,
      raw: execution.raw || null,
    };
    this.journal.push(entry);
    if (this.journal.length > 5000) this.journal.shift();
    this.save();
    return entry;
  }

  logClose(result) {
    return this.logTrade({
      type: 'CLOSE',
      ...result,
    });
  }

  logError(context, error) {
    return this.logTrade({
      type: 'ERROR',
      context,
      message: error.message,
      stack: error.stack,
    });
  }

  getJournal() {
    return this.journal.slice().reverse();
  }

  getTrades(status = null) {
    let trades = this.journal.filter(entry =>
      entry.type === 'EXECUTION' || entry.type === 'FAILED' || entry.type === 'REJECTED'
    );
    if (status) {
      trades = trades.filter(entry => entry.type === status);
    }
    return trades.slice().reverse();
  }
}

export const tradeLogger = new TradeLogger();
export default TradeLogger;
