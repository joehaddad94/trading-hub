import {
  type DayBoundary,
  DEFAULT_DAY_BOUNDARY,
  type RiskSource,
  rMultiple,
  SESSION_LABELS,
  type SessionName,
  sessionOf,
  tradingDay,
  weekdayOf,
} from '@trading/core';
import Decimal from 'decimal.js';

/** The facts the Trades screen filters, sorts and exports (tracker §8.3 screen 5). */
export type ListTrade = {
  id: string;
  accountId: string;
  ticket: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  openedAt: Date;
  closedAt: Date;
  openPrice: string;
  closePrice: string;
  slFinal: string | null;
  tpFinal: string | null;
  netProfit: string;
  commission: string;
  swap: string;
  riskUsd: string | null;
  riskSource: RiskSource | null;
  firmRr: string | null;
  isNews: boolean | null;
  journaled: boolean;
  followedPlan: boolean | null;
  tags: string[];
};

export const SORT_KEYS = ['closed', 'net', 'r', 'symbol', 'lots', 'hold'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type TradeFilters = {
  account?: string | null;
  symbol?: string | null;
  side?: 'buy' | 'sell' | null;
  session?: SessionName | null;
  weekday?: number | null;
  tag?: string | null;
  plan?: 'yes' | 'no' | 'unanswered' | null;
  news?: 'yes' | 'no' | null;
  /** Trading days 'YYYY-MM-DD', inclusive. */
  from?: string | null;
  to?: string | null;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
};

export type FilterContext = { boundary?: DayBoundary; loginOf: (accountId: string) => string };

const holdMs = (t: ListTrade) => t.closedAt.getTime() - t.openedAt.getTime();
const rOf = (t: ListTrade) => rMultiple(t.netProfit, t.riskUsd);

export function filterTrades(trades: ListTrade[], f: TradeFilters, ctx: FilterContext): ListTrade[] {
  const boundary = ctx.boundary ?? DEFAULT_DAY_BOUNDARY;
  const kept = trades.filter((t) => {
    const day = tradingDay(t.closedAt, boundary);
    if (f.account && ctx.loginOf(t.accountId) !== f.account) return false;
    if (f.symbol && t.symbol !== f.symbol) return false;
    if (f.side && t.side !== f.side) return false;
    if (f.session && sessionOf(t.openedAt) !== f.session) return false;
    if (f.weekday && weekdayOf(day) !== f.weekday) return false;
    if (f.tag && !t.tags.includes(f.tag)) return false;
    if (f.plan === 'yes' && t.followedPlan !== true) return false;
    if (f.plan === 'no' && t.followedPlan !== false) return false;
    if (f.plan === 'unanswered' && t.followedPlan !== null) return false;
    if (f.news === 'yes' && !t.isNews) return false;
    if (f.news === 'no' && t.isNews) return false;
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    return true;
  });
  return sortTrades(kept, f.sort ?? 'closed', f.dir ?? 'desc');
}

export function sortTrades(trades: ListTrade[], key: SortKey, dir: 'asc' | 'desc'): ListTrade[] {
  const sign = dir === 'asc' ? 1 : -1;
  const by = (t: ListTrade): Decimal | number | string => {
    switch (key) {
      case 'closed':
        return t.closedAt.getTime();
      case 'net':
        return new Decimal(t.netProfit);
      case 'r':
        return rOf(t) ?? new Decimal(-Infinity);
      case 'symbol':
        return t.symbol;
      case 'lots':
        return new Decimal(t.lots);
      case 'hold':
        return holdMs(t);
    }
  };
  return [...trades].sort((a, b) => {
    const x = by(a);
    const y = by(b);
    const c =
      x instanceof Decimal
        ? x.comparedTo(y as Decimal)
        : typeof x === 'string'
          ? x.localeCompare(y as string)
          : x - (y as number);
    return c !== 0 ? sign * c : sign * (a.closedAt.getTime() - b.closedAt.getTime());
  });
}

/** Distinct values for the filter dropdowns. */
export function filterOptions(trades: ListTrade[]) {
  return {
    symbols: [...new Set(trades.map((t) => t.symbol))].sort(),
    tags: [...new Set(trades.flatMap((t) => t.tags))].sort(),
  };
}

const csvCell = (v: string | number | boolean | null) => {
  if (v === null) return '';
  const s = String(v);
  // Quote when needed; prefix formula-looking cells so spreadsheets don't execute them.
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** CSV of the filtered view. Times in UTC ISO so a spreadsheet can convert them; money as exact decimals. */
export function tradesToCsv(trades: ListTrade[], ctx: FilterContext & { phaseOf: (accountId: string) => string }) {
  const header = [
    'account',
    'phase',
    'ticket',
    'symbol',
    'side',
    'lots',
    'opened_at_utc',
    'closed_at_utc',
    'trading_day',
    'session',
    'open_price',
    'close_price',
    'sl_final',
    'tp_final',
    'net_profit',
    'commission',
    'swap',
    'risk_usd',
    'risk_source',
    'r',
    'firm_rr',
    'news',
    'tags',
    'followed_plan',
    'journaled',
  ];
  const rows = trades.map((t) => [
    ctx.loginOf(t.accountId),
    ctx.phaseOf(t.accountId),
    t.ticket,
    t.symbol,
    t.side,
    t.lots,
    t.openedAt.toISOString(),
    t.closedAt.toISOString(),
    tradingDay(t.closedAt, ctx.boundary ?? DEFAULT_DAY_BOUNDARY),
    SESSION_LABELS[sessionOf(t.openedAt)],
    t.openPrice,
    t.closePrice,
    t.slFinal,
    t.tpFinal,
    t.netProfit,
    t.commission,
    t.swap,
    t.riskUsd,
    t.riskSource,
    rOf(t)?.toFixed(2) ?? null,
    t.firmRr,
    t.isNews === null ? null : t.isNews,
    t.tags.join('; '),
    t.followedPlan,
    t.journaled,
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
