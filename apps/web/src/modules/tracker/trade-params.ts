import { SORT_KEYS, type TradeFilters } from '@trading/tracker';
import { z } from 'zod';

const DAY = z.iso.date();
const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v);
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema.nullable()).catch(null);

/** Trades screen filters from the URL (zod at the boundary, rule 9). Bad values are dropped, not errors. */
const schema = z.object({
  account: opt(z.string().regex(/^\d{1,20}$/)),
  symbol: opt(z.string().max(32)),
  side: opt(z.enum(['buy', 'sell'])),
  session: opt(z.enum(['asia', 'london', 'ny_am', 'ny_pm', 'outside'])),
  weekday: opt(z.coerce.number().int().min(1).max(7)),
  tag: opt(z.string().max(64)),
  plan: opt(z.enum(['yes', 'no', 'unanswered'])),
  news: opt(z.enum(['yes', 'no'])),
  from: opt(DAY),
  to: opt(DAY),
  sort: z.enum(SORT_KEYS).catch('closed'),
  dir: z.enum(['asc', 'desc']).catch('desc'),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type TradeParams = TradeFilters & { sort: (typeof SORT_KEYS)[number]; dir: 'asc' | 'desc'; page: number };

export function parseTradeParams(input: Record<string, string | string[] | undefined>): TradeParams {
  const flat = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return schema.parse(flat) as TradeParams;
}

/** The same filters as a query string (for sort links, paging and the CSV export). */
export function tradeQuery(scope: string, p: TradeParams, overrides: Partial<TradeParams> = {}): string {
  const merged = { ...p, ...overrides };
  const q = new URLSearchParams();
  if (scope !== 'all') q.set('scope', scope);
  for (const key of ['account', 'symbol', 'side', 'session', 'weekday', 'tag', 'plan', 'news', 'from', 'to'] as const) {
    const v = merged[key];
    if (v !== null && v !== undefined && v !== '') q.set(key, String(v));
  }
  if (merged.sort !== 'closed') q.set('sort', merged.sort);
  if (merged.dir !== 'desc') q.set('dir', merged.dir);
  if (merged.page > 1) q.set('page', String(merged.page));
  return q.toString();
}
