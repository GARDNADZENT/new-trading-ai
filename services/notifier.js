import axios from 'axios';
import config from '../config.js';

class Notifier {
  /**
   * Format a signal result into a rich message and send to all enabled channels.
   */
  async sendSignals(result) {
    if (!result || result.error) {
      await this.send({
        type: 'error',
        title: 'Signal Generation Error',
        message: result?.error || 'Unknown error',
      });
      return;
    }

    const message = this.formatMessage(result);
    const tasks = [];

    if (config.notifications.telegram.enabled) {
      tasks.push(this.sendTelegram(message));
    }
    if (config.notifications.discord.enabled) {
      tasks.push(this.sendDiscord(message));
    }
    if (config.notifications.mt5.enabled) {
      tasks.push(this.sendMt5(result));
    }

    // Console output
    console.log('\n' + message + '\n');

    try {
      await Promise.allSettled(tasks);
    } catch (err) {
      console.error('[Notifier] Error sending notifications:', err.message);
    }
  }

  formatMessage(result) {
    const { event, data, currencyStrength, direction, signals, confidence, optimalHoldingTime } = result;
    const stars = (n) => '⭐'.repeat(n);

    let msg = '===========================================\n';
    msg += `Event:\n${event.title}\n\n`;
    msg += `Forecast : ${data.forecast}\n`;
    msg += `Actual   : ${data.actual}\n`;
    msg += `Previous : ${data.previous}\n\n`;
    msg += `Currency Strength:\n${Object.keys(currencyStrength).map(k => `${k} -> ${currencyStrength[k]}`).join('\n')}\n\n`;
    msg += `Trade Signals\n`;
    for (const s of signals) {
      msg += `${s.pair} ${s.action} ${stars(s.strength)}\n`;
    }
    msg += `\nReason:\n`;
    msg += `Actual ${direction === 'above' ? '>' : direction === 'below' ? '<' : '='} Forecast\n`;
    msg += this.buildReason(event.category, direction, currencyStrength);
    msg += `\n\nConfidence: ${confidence}%\n`;
    msg += `Optimal Holding Time: ${optimalHoldingTime} min\n`;
    msg += '===========================================';
    return msg;
  }

  buildReason(category, direction, currencyStrength) {
    const reasons = {
      'NFP': 'Employment data',
      'Non-Farm Payrolls': 'Employment data',
      'CPI': 'Inflation pressure',
      'PPI': 'Producer prices',
      'Jobless Claims': 'Labor market health',
      'Retail Sales': 'Consumer spending',
      'Average Hourly Earnings': 'Wage growth',
      'Unemployment Rate': 'Labor market',
      'GDP': 'Economic growth',
      'PMI': 'Sector activity',
      'Services PMI': 'Services sector',
      'Manufacturing PMI': 'Manufacturing sector',
      'FOMC': 'Monetary policy',
      'Interest Rate': 'Rate decision',
      'PCE': 'Inflation (PCE deflator)',
      'Oil Inventories': 'Supply/demand',
      'Trade Balance': 'Trade flows',
      'Consumer Confidence': 'Sentiment',
    };
    const reason = reasons[category] || 'Economic data';
    const weak = direction === 'below';
    const strong = direction === 'above';
    let txt = `${reason}\n`;
    const usdStrength = currencyStrength.USD;
    if (usdStrength === 'Bullish') txt += 'Strong USD';
    if (usdStrength === 'Bearish') txt += 'Weak USD';
    return txt;
  }

  async send(payload) {
    if (payload.type === 'error') {
      console.error(`[Notifier] ${payload.title}: ${payload.message}`);
    }
    if (config.notifications.telegram.enabled) {
      await this.sendTelegram(`[${payload.type.toUpperCase()}] ${payload.title}: ${payload.message}`);
    }
    if (config.notifications.discord.enabled) {
      await this.sendDiscord(`**${payload.type}**: ${payload.title} - ${payload.message}`);
    }
  }

  async sendTelegram(text) {
    if (!config.notifications.telegram.enabled) return;
    try {
      const url = `https://api.telegram.org/bot${config.notifications.telegram.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: config.notifications.telegram.chatId,
        text,
        parse_mode: 'Markdown',
      }, { timeout: 10000 });
    } catch (err) {
      console.error('[Notifier] Telegram failed:', err.message);
    }
  }

  async sendDiscord(content) {
    if (!config.notifications.discord.enabled) return;
    try {
      await axios.post(config.notifications.discord.webhookUrl, {
        content,
      }, { timeout: 10000 });
    } catch (err) {
      console.error('[Notifier] Discord failed:', err.message);
    }
  }

  async sendMt5(signal) {
    if (!config.notifications.mt5.enabled) return;
    console.log('[Notifier] MT5 trade signal generated:', JSON.stringify(signal.signals));
    // Placeholder: integrate MT5 terminal API or use mt5-api-node
  }

  /**
   * Send a formatted HTML-style message to Telegram with bold headers.
   */
  async sendHtmlTelegram(htmlText) {
    if (!config.notifications.telegram.enabled) return;
    try {
      const url = `https://api.telegram.org/bot${config.notifications.telegram.botToken}/sendMessage`;
      await axios.post(url, {
        chat_id: config.notifications.telegram.chatId,
        text: htmlText,
        parse_mode: 'HTML',
      }, { timeout: 10000 });
    } catch (err) {
      console.error('[Notifier] Telegram HTML failed:', err.message);
    }
  }
}

export default new Notifier();
