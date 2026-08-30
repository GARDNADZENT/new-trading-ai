import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import config from '../config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const NAIROBI_TZ = 'Africa/Nairobi';
const TZ_OFFSET_HOURS = config.timezone.offsetHours || 3;

const WEEKLY_EVENTS = [
  { day: 1, hour: 14, minute: 0, title: 'USD ISM Manufacturing PMI', currency: 'USD', impact: 'high', forecast: '49.5', unit: 'index' },
  { day: 1, hour: 13, minute: 30, title: 'USD Existing Home Sales', currency: 'USD', impact: 'medium', forecast: '4.5M', unit: 'M' },
  { day: 1, hour: 13, minute: 0, title: 'USD JOLTS Job Openings', currency: 'USD', impact: 'high', forecast: '10.2M', unit: 'M' },
  { day: 2, hour: 12, minute: 15, title: 'USD ADP Employment Change', currency: 'USD', impact: 'high', forecast: '120K', unit: 'K' },
  { day: 3, hour: 12, minute: 15, title: 'USD ADP Employment Change', currency: 'USD', impact: 'high', forecast: '120K', unit: 'K' },
  { day: 3, hour: 14, minute: 30, title: 'USD Crude Oil Inventories', currency: 'USD', impact: 'high', forecast: '2.1M', unit: 'M' },
  { day: 4, hour: 12, minute: 30, title: 'USD Initial Jobless Claims', currency: 'USD', impact: 'high', forecast: '230K', unit: 'K' },
  { day: 4, hour: 13, minute: 0, title: 'USD Continuing Jobless Claims', currency: 'USD', impact: 'medium', forecast: '1.85M', unit: 'M' },
  { day: 4, hour: 12, minute: 30, title: 'USD Durable Goods Orders', currency: 'USD', impact: 'medium', forecast: '1.2%', unit: '%' },
  { day: 4, hour: 14, minute: 0, title: 'USD Factory Orders', currency: 'USD', impact: 'medium', forecast: '0.5%', unit: '%' },
  { day: 5, hour: 12, minute: 30, title: 'USD Non-Farm Payrolls', currency: 'USD', impact: 'high', forecast: '180K', unit: 'K' },
  { day: 5, hour: 12, minute: 30, title: 'USD Unemployment Rate', currency: 'USD', impact: 'high', forecast: '4.2%', unit: '%' },
  { day: 5, hour: 12, minute: 30, title: 'USD Average Hourly Earnings', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%' },
  { day: 5, hour: 12, minute: 30, title: 'USD Average Weekly Hours', currency: 'USD', impact: 'low', forecast: '34.5', unit: '' },
  { day: 5, hour: 12, minute: 30, title: 'CAD Employment Change', currency: 'CAD', impact: 'high', forecast: '15.0K', unit: 'K' },
  { day: 5, hour: 12, minute: 30, title: 'CAD Unemployment Rate', currency: 'CAD', impact: 'high', forecast: '6.8%', unit: '%' },
  { day: 5, hour: 14, minute: 0, title: 'USD Consumer Sentiment', currency: 'USD', impact: 'high', forecast: '68.0', unit: 'index' },
];

const MONTHLY_EVENTS = [
  { day: 1, hour: 14, minute: 0, title: 'USD ISM Manufacturing PMI', currency: 'USD', impact: 'high', forecast: '49.5', unit: 'index', pattern: 'first_bday' },
  { day: 14, hour: 14, minute: 30, title: 'USD CPI m/m', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'mid_month' },
  { day: 14, hour: 14, minute: 30, title: 'USD Core CPI m/m', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'mid_month' },
  { day: 14, hour: 14, minute: 30, title: 'USD PPI m/m', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'mid_month' },
  { day: 14, hour: 14, minute: 30, title: 'USD Core PPI m/m', currency: 'USD', impact: 'medium', forecast: '0.2%', unit: '%', pattern: 'mid_month' },
  { day: 1, hour: 14, minute: 0, title: 'EUR CPI m/m', currency: 'EUR', impact: 'high', forecast: '0.2%', unit: '%', pattern: 'mid_month' },
  { day: 1, hour: 13, minute: 0, title: 'GBP CPI m/m', currency: 'GBP', impact: 'high', forecast: '0.2%', unit: '%', pattern: 'mid_month' },
  { day: 1, hour: 13, minute: 0, title: 'USD Existing Home Sales', currency: 'USD', impact: 'medium', forecast: '4.5M', unit: 'M', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Retail Sales m/m', currency: 'USD', impact: 'high', forecast: '0.4%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Consumer Confidence', currency: 'USD', impact: 'high', forecast: '105.0', unit: 'index', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD New Home Sales', currency: 'USD', impact: 'medium', forecast: '620K', unit: 'K', pattern: 'monthly' },
  { day: 15, hour: 14, minute: 0, title: 'JPY Tankan', currency: 'JPY', impact: 'high', forecast: '7', unit: 'index', pattern: 'quarterly' },
  { day: 1, hour: 14, minute: 0, title: 'AUD Retail Sales m/m', currency: 'AUD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'AUD Employment Change', currency: 'AUD', impact: 'high', forecast: '20K', unit: 'K', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'AUD Unemployment Rate', currency: 'AUD', impact: 'medium', forecast: '3.9%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'GBP Employment Change', currency: 'GBP', impact: 'high', forecast: '30K', unit: 'K', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'GBP Unemployment Rate', currency: 'GBP', impact: 'medium', forecast: '4.1%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'CAD Trade Balance', currency: 'CAD', impact: 'high', forecast: '-2.5B', unit: 'B', pattern: 'monthly' },
  { day: 1, hour: 13, minute: 0, title: 'AUD Trade Balance', currency: 'AUD', impact: 'medium', forecast: '8.0B', unit: 'B', pattern: 'monthly' },
  { day: 1, hour: 13, minute: 0, title: 'NZD Trade Balance', currency: 'NZD', impact: 'medium', forecast: '500M', unit: 'M', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'CHF CPI m/m', currency: 'CHF', impact: 'high', forecast: '0.2%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'EUR-GDP q/q', currency: 'EUR', impact: 'high', forecast: '0.5%', unit: '%', pattern: 'quarterly' },
  { day: 1, hour: 14, minute: 0, title: 'USD GDP q/q', currency: 'USD', impact: 'high', forecast: '1.3%', unit: '%', pattern: 'quarterly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Core PCE Price Index m/m', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Personal Income m/m', currency: 'USD', impact: 'high', forecast: '0.3%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Pending Home Sales m/m', currency: 'USD', impact: 'low', forecast: '0.5%', unit: '%', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD ISM Services PMI', currency: 'USD', impact: 'high', forecast: '52.0', pattern: 'monthly' },
  { day: 1, hour: 13, minute: 0, title: 'USD Challenger Job-Cut Report', currency: 'USD', impact: 'low', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'EUR-GDP', currency: 'EUR', impact: 'high', pattern: 'quarterly' },
  { day: 1, hour: 14, minute: 0, title: 'EUR-GDP Unemployment Rate', currency: 'EUR', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'EUR-GDP Manufacturing PMI', currency: 'EUR', impact: 'high', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'EUR-GDP Services PMI', currency: 'EUR', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'GBP Manufacturing PMI', currency: 'GBP', impact: 'high', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'GBP Services PMI', currency: 'GBP', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'JPY Manufacturing PMI', currency: 'JPY', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'JPY National CPI m/m', currency: 'JPY', impact: 'high', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'AUD Manufacturing PMI', currency: 'AUD', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'AUD Services PMI', currency: 'AUD', impact: 'low', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'CAD Manufacturing PMI', currency: 'CAD', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'CAD Ivey PMI', currency: 'CAD', impact: 'high', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'CHF Manufacturing PMI', currency: 'CHF', impact: 'medium', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'NZD Business NZ Performance of Services', currency: 'NZD', impact: 'low', pattern: 'monthly' },
  { day: 1, hour: 14, minute: 0, title: 'USD Existing Home Sales', currency: 'USD', impact: 'high', pattern: 'monthly' },
];

const BULLISH_CATEGORIES = new Set([
  'NFP', 'Non-Farm Payrolls', 'GDP', 'Jobless Claims', 'Retail Sales',
  'Average Hourly Earnings', 'PPI', 'PCE', 'PMI', 'FOMC', 'Interest Rate',
  'Oil Inventories', 'Trade Balance', 'Services PMI', 'Manufacturing PMI',
  'Non-Farm Payrolls', 'Employment Change',
]);

const BEARISH_CATEGORIES = new Set([
  'Unemployment Rate', 'CPI',
]);

function getBusinessDaysInMonth(year, month) {
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const date = dayjs.utc(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    if (date.isValid() && date.day() >= 1 && date.day() <= 5) {
      days.push(d);
    }
  }
  return days;
}

function getNthBusinessDayOfMonth(year, month, n) {
  const bdays = getBusinessDaysInMonth(year, month);
  return bdays.length >= n ? bdays[n - 1] : null;
}

function isQuarterStartMonth(month) {
  return [0, 2, 5, 7, 9, 10].includes(month);
}

function getEventCategory(title) {
  const t = title.toLowerCase();
  if (t.includes('non-farm') || t.includes('employment change') || t.includes('payrolls')) return 'NFP';
  if (t.includes('pmi')) return 'PMI';
  if (t.includes('cpi')) return 'CPI';
  if (t.includes('gdp')) return 'GDP';
  if (t.includes('unemployment rate')) return 'Unemployment Rate';
  if (t.includes('jobless') || t.includes('challenger')) return 'Jobless Claims';
  if (t.includes('retail sales')) return 'Retail Sales';
  if (t.includes('earnings')) return 'Earnings';
  if (t.includes('trade balance')) return 'Trade Balance';
  if (t.includes('crude oil')) return 'Oil Inventories';
  if (t.includes('sentiment') || t.includes('confidence')) return 'Consumer Confidence';
  if (t.includes('durable goods')) return 'Durable Goods';
  if (t.includes('factory orders')) return 'Durable Goods';
  return 'General';
}

function getTradingPairs(currency, category) {
  const pairs = config.currencyPairs[currency] || [];
  const commodities = config.commodities[currency] || [];
  const allPairs = [...new Set([...pairs, ...commodities])];
  const isBullishCat = BULLISH_CATEGORIES.has(category);
  const isBearishCat = BEARISH_CATEGORIES.has(category);

  const pairSignals = allPairs.map(pair => {
    const hasCurrency = pair.includes(currency);
    if (!hasCurrency) return null;

    const isBase = pair.startsWith(currency);
    const isQuote = pair.endsWith(currency);

    let aboveAction, belowAction;
    if (currency === 'USD') {
      if (isBase && !isQuote) {
        aboveAction = 'BUY';
        belowAction = 'SELL';
      } else if (isQuote && !isBase) {
        aboveAction = 'SELL';
        belowAction = 'BUY';
      } else {
        aboveAction = 'BUY';
        belowAction = 'SELL';
      }
      if (pair === 'XAUUSD' || pair === 'XAGUSD') {
        aboveAction = 'SELL';
        belowAction = 'BUY';
      }
    } else {
      if (isBase) {
        aboveAction = 'BUY';
        belowAction = 'SELL';
      } else if (isQuote) {
        aboveAction = 'SELL';
        belowAction = 'BUY';
      } else {
        aboveAction = 'BUY';
        belowAction = 'SELL';
      }
    }

    return {
      pair,
      above: aboveAction,
      below: belowAction,
    };
  }).filter(Boolean);

  return pairSignals;
}

function formatNairobiTime(ts) {
  const nb = dayjs.unix(ts).utcOffset(TZ_OFFSET_HOURS * 60);
  return nb.format('YYYY-MM-DD HH:mm:ss');
}

function formatNairobiDate(ts) {
  const nb = dayjs.unix(ts).utcOffset(TZ_OFFSET_HOURS * 60);
  return nb.format('YYYY-MM-DD');
}

function formatNairobiTimeShort(ts) {
  const nb = dayjs.unix(ts).utcOffset(TZ_OFFSET_HOURS * 60);
  return nb.format('HH:mm');
}

function generateWeeklyEvents(now, daysBack = 0, daysAhead = 7) {
  const events = [];
  const utcNow = dayjs.utc(now);
  const todayStart = utcNow.startOf('day');
  const pastStart = utcNow.subtract(daysBack, 'day');

  for (const ev of WEEKLY_EVENTS) {
    let eventDate = utcNow.startOf('day');
    const targetDay = ev.day;

    const todayDay = utcNow.day();
    if (todayDay < targetDay) {
      eventDate = eventDate.add(targetDay - todayDay, 'day');
    } else if (todayDay > targetDay) {
      eventDate = eventDate.add(7 - (todayDay - targetDay), 'day');
    }

    if (eventDate.isBefore(todayStart)) {
      eventDate = eventDate.add(7, 'day');
    }

     let ts = Math.floor(eventDate.hour(ev.hour).minute(ev.minute).second(0).valueOf() / 1000);
    const nowTs = Math.floor(Date.now() / 1000);
    const category = getEventCategory(ev.title);

    if (ts > nowTs) {
      events.push(buildEvent(ts, ev, category, false));
    } else if (ts > Math.floor(pastStart.valueOf() / 1000)) {
      events.push(buildEvent(ts, ev, category, true));
    }

    let pastDate = eventDate.subtract(7, 'day');
    let pastTs = Math.floor(pastDate.hour(ev.hour).minute(ev.minute).second(0).valueOf() / 1000);
    while (pastTs > pastStart.valueOf() / 1000 && pastTs < nowTs) {
      events.push(buildEvent(pastTs, ev, category, true));
      pastDate = pastDate.subtract(7, 'day');
      pastTs = Math.floor(pastDate.hour(ev.hour).minute(ev.minute).second(0).valueOf() / 1000);
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function buildEvent(ts, ev, category, isPast) {
  const isReleased = isPast || false;
  return {
    id: `schedule-${ev.title}-${ts}`,
    timestamp: ts,
    date: formatNairobiDate(ts),
    time: formatNairobiTimeShort(ts),
    timezone: 'EAT',
    nairobiTime: formatNairobiTime(ts),
    title: ev.title,
    currency: ev.currency,
    impact: ev.impact || 'medium',
    forecast: ev.forecast || null,
    previous: null,
    actual: null,
    unit: ev.unit || '',
    eventName: ev.title,
    category,
    released: isPast,
    estimated: true,
    source: 'schedule',
    pairs: getTradingPairs(ev.currency, category),
  };
}

function generateMonthlyEvents(now, daysBack = 0, daysAhead = 7) {
  const events = [];
  const today = dayjs.utc(now);
  const pastStart = today.subtract(daysBack, 'day');
  const nextMonth = today.add(1, 'month');
  const monthsToCheck = [today, nextMonth, today.subtract(1, 'month')];

  for (const monthRef of monthsToCheck) {
    const year = monthRef.year();
    const month = monthRef.month();
    const firstBday = getNthBusinessDayOfMonth(year, month, 1);
    const midMonthDay = 14;

    for (const ev of MONTHLY_EVENTS) {
      if (!ev.pattern) continue;

      let eventDay = null;
      if (ev.pattern === 'first_bday') {
        eventDay = firstBday;
      } else if (ev.pattern === 'mid_month') {
        let d = dayjs.utc(`${year}-${String(month + 1).padStart(2, '0')}-${String(midMonthDay).padStart(2, '0')}`);
        while (d.day() === 0 || d.day() === 6) {
          d = d.add(1, 'day');
        }
        eventDay = d.date();
      } else if (ev.pattern === 'monthly') {
        let d = dayjs.utc(`${year}-${String(month + 1).padStart(2, '0')}-${String(15).padStart(2, '0')}`);
        while (d.day() === 0 || d.day() === 6) {
          d = d.subtract(1, 'day');
        }
        eventDay = d.date();
      } else if (ev.pattern === 'quarterly') {
        if (!isQuarterStartMonth(month)) continue;
        let d = dayjs.utc(`${year}-${String(month + 1).padStart(2, '0')}-${String(15).padStart(2, '0')}`);
        while (d.day() === 0 || d.day() === 6) {
          d = d.subtract(1, 'day');
        }
        eventDay = d.date();
      }

      if (!eventDay) continue;

      const eventDate = dayjs.utc(`${year}-${String(month + 1).padStart(2, '0')}-${String(eventDay).padStart(2, '0')}`).hour(ev.hour).minute(ev.minute).second(0);
      const ts = Math.floor(eventDate.valueOf() / 1000);

      const nowTs = Math.floor(Date.now() / 1000);
      const fromTs = Math.floor(pastStart.valueOf() / 1000);
      const toTs = nowTs + daysAhead * 24 * 60 * 60;

      if (ts >= fromTs && ts <= toTs) {
        const category = getEventCategory(ev.title);
        const isPast = ts < nowTs;

        events.push({
          id: `schedule-${ev.title}-${ts}`,
          timestamp: ts,
          date: formatNairobiDate(ts),
          time: formatNairobiTimeShort(ts),
          timezone: 'EAT',
          nairobiTime: formatNairobiTime(ts),
          title: ev.title,
          currency: ev.currency,
          impact: ev.impact || 'medium',
          forecast: ev.forecast || null,
          previous: null,
          actual: null,
          unit: ev.unit || '',
          eventName: ev.title,
          category,
          released: isPast,
          estimated: true,
          source: 'schedule',
          pairs: getTradingPairs(ev.currency, category),
        });
      }
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

export function generateScheduleEvents(daysAhead = 7, daysBack = 3) {
  const now = Date.now();
  const weekly = generateWeeklyEvents(now, daysBack, daysAhead);
  const monthly = generateMonthlyEvents(now, daysBack, daysAhead);
  const all = [...weekly, ...monthly]
    .filter(e => e.timestamp >= Math.floor(now / 1000) - daysBack * 24 * 60 * 60 && e.timestamp < Math.floor(now / 1000) + daysAhead * 24 * 60 * 60)
    .sort((a, b) => a.timestamp - b.timestamp);

  const seen = new Set();
  const unique = all.filter(e => {
    const key = `${e.title}-${e.timestamp}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique;
}

export function getScheduleEventsForDate(targetDate) {
  const day = dayjs(targetDate);
  const start = day.startOf('day').valueOf() / 1000;
  const end = day.add(1, 'day').startOf('day').valueOf() / 1000;

  const weekly = generateWeeklyEvents(day.valueOf());
  const monthly = generateMonthlyEvents(day.valueOf());
  const all = [...weekly, ...monthly]
    .filter(e => e.timestamp >= start && e.timestamp < end)
    .sort((a, b) => a.timestamp - b.timestamp);

  return all;
}

export default { generateScheduleEvents, getScheduleEventsForDate };
