/**
 * The same index under two names (audit U10): FundedNext's export says NDX100, Dukascopy and the Backtest Lab
 * say NAS100. Data keeps each source's code; screens show the other name alongside.
 */
const ALIASES: Record<string, string> = { NDX100: 'NAS100', NAS100: 'NDX100' };

/** `NDX100 (NAS100)` for an aliased symbol, otherwise the symbol itself. */
export function symbolWithAlias(symbol: string): string {
  const alias = ALIASES[symbol];
  return alias ? `${symbol} (${alias})` : symbol;
}

/**
 * A price for display: trailing zeros trimmed down to at least `minDp` decimals, so index prices exported with
 * five decimals (30778.00000) read 30778.00 while forex keeps its pips (1.08534).
 */
export function formatPrice(price: string | null | undefined, minDp = 2): string {
  if (price === null || price === undefined || price === '') return '—';
  const [int, frac = ''] = price.split('.');
  const trimmed = frac.replace(/0+$/, '');
  return `${int}.${trimmed.padEnd(minDp, '0')}`;
}
