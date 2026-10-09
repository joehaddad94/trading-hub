import type { DayStats, PeriodSummary } from '@trading/core';
import Decimal from 'decimal.js';
import { formatMoney } from '@/lib/format';
import type { CellMode } from './search-params';

/** Whole dollars with thousands separators: `-$1,235` — fits a 5-column phone grid. */
export function formatMoneyShort(value: Decimal): string {
  return formatMoney(value.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(2)).replace(/\.00$/, '');
}

export const formatR = (r: Decimal | null) => (r ? `${r.gte(0) ? '+' : ''}${r.toFixed(2)}R` : '—');

export const pluralTrades = (n: number) => `${n} ${n === 1 ? 'trade' : 'trades'}`;

/** The main number of a day cell, per the cell display toggle. */
export function cellValue(
  stats: DayStats | PeriodSummary,
  mode: CellMode,
  startingBalanceTotal: string,
  short = false,
) {
  switch (mode) {
    case 'net':
      return short ? formatMoneyShort(stats.net) : formatMoney(stats.net);
    case 'r':
      return formatR(stats.netR);
    case 'count':
      return pluralTrades(stats.trades);
    case 'winrate':
      return stats.winRate ? `${stats.winRate.times(100).toFixed(0)}%` : '—';
    case 'pct': {
      const total = new Decimal(startingBalanceTotal);
      return total.gt(0) ? `${stats.net.div(total).times(100).toFixed(2)}%` : '—';
    }
  }
}

export function formatHold(ms: number | null): string {
  if (ms === null) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Colour per account (dots and chart lines), stable by position in the scope. */
export const ACCOUNT_COLOURS = ['#60a5fa', '#f59e0b', '#a78bfa', '#2dd4bf', '#f472b6', '#a3e635'];
