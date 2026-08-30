export function runMarketIntegrityChecks(ctx) {
  const checks = [];
  const add = (name, status, detail = '') => checks.push({ name, status, detail });

  const spread = ctx.spread ?? 0;
  const spreadLimit = ctx.maxSpread ?? 3;
  if (spread <= 0) add('Spread', 'fail', 'No spread data');
  else if (spread > spreadLimit) add('Spread', 'fail', `EXTREME (${spread} > ${spreadLimit})`);
  else if (spread > spreadLimit * 0.7) add('Spread', 'warn', `HIGH (${spread})`);
  else add('Spread', 'ok', `${spread}`);

  const volatility = ctx.volatility ?? 1;
  if (volatility >= 2.5) add('Volatility', 'fail', `EXTREME (${volatility.toFixed(2)})`);
  else if (volatility >= 1.8) add('Volatility', 'warn', `HIGH (${volatility.toFixed(2)})`);
  else add('Volatility', 'ok', volatility.toFixed(2));

  const slippage = ctx.slippage ?? 0;
  if (slippage > (ctx.maxSlippage ?? 2)) add('Slippage', 'fail', `HIGH (${slippage})`);
  else if (slippage > (ctx.maxSlippage ?? 2) * 0.6) add('Slippage', 'warn', `ELEVATED (${slippage})`);
  else add('Slippage', 'ok', `${slippage}`);

  add('Price Validity', ctx.priceValid === false ? 'fail' : 'ok', ctx.priceValid === false ? 'Invalid price' : 'Valid');

  const trading = ctx.marketStatus !== false && ctx.tradeMode !== 0;
  add('Market/Trading Status', trading ? 'ok' : 'fail', trading ? 'Open' : 'Closed/No trading');

  const freeMargin = ctx.account?.margin_free ?? ctx.freeMargin ?? 0;
  add('Margin', freeMargin <= 0 ? 'fail' : 'ok', `Free ${freeMargin}`);

  add('Account Risk', ctx.riskBlocked ? 'fail' : 'ok', ctx.riskBlocked ? 'Risk exceeded' : 'Within limits');

  const lot = ctx.lotSize ?? 0;
  const spec = ctx.spec || {};
  const minLot = spec.min_lot ?? 0;
  const maxLot = spec.max_lot ?? 100;
  if (lot > 0 && lot < minLot) add('Broker Volume', 'fail', `Below min ${minLot}`);
  else if (lot > maxLot) add('Broker Volume', 'fail', `Above max ${maxLot}`);
  else add('Broker Volume', 'ok', `Lot ${lot || 'n/a'}`);

  const sl = ctx.stopLoss;
  const tp = ctx.takeProfit;
  const entry = ctx.entry;
  let slTpValid = true;
  if (entry != null && sl != null && tp != null) {
    if (ctx.direction === 'BUY' && !(sl < entry && entry < tp)) slTpValid = false;
    if (ctx.direction === 'SELL' && !(tp < entry && entry < sl)) slTpValid = false;
  }
  add('SL/TP Validity', slTpValid ? 'ok' : 'fail', slTpValid ? 'Valid' : 'Invalid structure');

  add('Duplicate Protection', ctx.duplicate ? 'fail' : 'ok', ctx.duplicate ? 'Duplicate event' : 'Clear');

  const open = ctx.openTrades ?? 0;
  const maxOpen = ctx.maxOpenTrades ?? 3;
  if (open >= maxOpen) add('Max Open Trades', 'fail', `${open}/${maxOpen}`);
  else add('Max Open Trades', 'ok', `${open}/${maxOpen}`);

  const failed = checks.filter((c) => c.status === 'fail');
  const approved = failed.length === 0;
  return {
    approved,
    reason: approved ? 'All checks passed' : `Abnormal conditions: ${failed.map((c) => c.name).join(', ')}`,
    checks,
  };
}

export default { runMarketIntegrityChecks };
