import fs from 'fs';
import path from 'path';
import config from '../config.js';

const MT5_TERMINAL = 'D0E8209F77C8CF37AD8BF550E51FF075';
const FILES_DIR = `/mnt/c/Users/gadna/AppData/Roaming/MetaQuotes/Terminal/${MT5_TERMINAL}/MQL5/Files`;
const QUEUE_FILE = path.join(FILES_DIR, 'trade_queue.txt');
const RESULT_FILE = path.join(FILES_DIR, 'trade_results.txt');
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 15000;

function appendLine(filePath, line) {
   fs.appendFileSync(filePath, line + '\n', 'utf8');
}

function readResults() {
   if (!fs.existsSync(RESULT_FILE)) return [];
   const content = fs.readFileSync(RESULT_FILE, 'utf8');
   const lines = content.split('\n').filter(line => line.trim().length > 0);
   return lines.map(line => {
      const [resultType, ...rest] = line.split('|');
      const value = rest.join('|');
      if (resultType === 'OK') {
         return { success: true, ticket: value, raw: line };
      } else if (resultType === 'ERROR') {
         return { success: false, error: value, raw: line };
      }
      return { success: false, error: 'Unknown response format', raw: line };
   });
}

function waitForResult(expectedCommand, startTime) {
   return new Promise((resolve) => {
      const seen = new Set();
      const interval = setInterval(() => {
         if (Date.now() - startTime > MAX_WAIT_MS) {
            clearInterval(interval);
            resolve({ success: false, error: 'MT5 Bridge request timeout', raw: '' });
            return;
         }
         const results = readResults();
         for (const result of results) {
            const key = result.raw;
            if (seen.has(key)) continue;
            seen.add(key);
            if (result.raw.includes(expectedCommand)) {
               clearInterval(interval);
               resolve(result);
               return;
            }
         }
      }, POLL_INTERVAL_MS);
   });
}

export async function sendMarketOrder(symbol, direction, volume, sl = 0, tp = 0, comment = 'TradePulse', magic = 123456) {
   const command = `${direction.toUpperCase()}|${symbol}|${volume}|${sl}|${tp}|${magic}|${comment}`;
   const startTime = Date.now();

   appendLine(QUEUE_FILE, command);
   return await waitForResult(command, startTime);
}

export async function sendPendingOrder(symbol, direction, volume, price, sl = 0, tp = 0, stoplimit = 0, comment = 'TradePulse', magic = 123456) {
   const command = `PENDING|${direction.toUpperCase()}|${symbol}|${volume}|${price}|${sl}|${tp}|${stoplimit}|${magic}|${comment}`;
   const startTime = Date.now();

   appendLine(QUEUE_FILE, command);
   return await waitForResult(command, startTime);
}

export default { sendMarketOrder, sendPendingOrder };
