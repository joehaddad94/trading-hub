import { TZDate } from '@date-fns/tz';
import Decimal from 'decimal.js';
import { SESSION_TZ, sessionOf } from '../time/sessions';
import type { AnalyticsTrade } from './analytics';
import { DEFAULT_SCRATCH_THRESHOLD_R, rMultiple, tradeStats } from './metrics';

/**
 * Live vs backtest (tracker spec §8.3 screen 8, Joe 4 Nov 2026). Joe trades US30 and NAS100 live as one
 * strategy, taking whichever breaks out, but backtests each index on its own. So the unit of comparison is the
 * kill-zone session (New York day + kill zone), and the backtest is shown two ways:
 * - Portfolio: every backtest trade counts (upper bound: both indices traded whenever both triggered).
 * - One pick: per session only the first backtest trade to open counts, on either index (lower bound).
 */
export type CompareTrade = AnalyticsTrade & { followedPlan?: boolean | null };

export type PeriodKind = 'week' | 'month' | 'all';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** The New York calendar day of an instant, as a UTC-midnight Date (for day arithmetic only). */
function nyDay(at: Date): Date {
  const z = new TZDate(at.getTime(), SESSION_TZ);
  return new Date(Date.UTC(z.getFullYear(), z.getMonth(), z.getDate()));
}

/** Session key: New York day + kill zone, e.g. `2026-10-06|ny_am`. */
export function sessionKeyOf(openedAt: Date): string {
  return `${isoDay(nyDay(openedAt))}|${sessionOf(openedAt)}`;
}

/**
 * Period key of a trade's open, in New York time. Weeks are named by their Monday (`2026-11-02`); Sunday
 * belongs to the week that follows, because Sunday evening is that week's first Asia session. Months: `2026-11`.
 */
export function periodKeyOf(kind: PeriodKind, at: Date): string {
  if (kind === 'all') return 'all';
  const day = nyDay(at);
  if (kind === 'month') return `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}`;
  const dow = day.getUTCDay();
  const toMonday = dow === 0 ? 1 : 1 - dow;
  return isoDay(new Date(day.getTime() + toMonday * 86_400_000));
}

const WEEK_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_KEY = /^(\d{4})-(\d{2})$/;

/** True when `key` is a well-formed key of that kind (weeks must name a Monday). */
export function isPeriodKey(kind: PeriodKind, key: string): boolean {
  if (kind === 'all') return key === 'all';
  if (kind === 'month') {
    const m = MONTH_KEY.exec(key);
    return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
  }
  const m = WEEK_KEY.exec(key);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return isoDay(d) === key && d.getUTCDay() === 1;
}

/** The key `steps` periods before (negative) or after (positive) `key`. */
export function shiftPeriod(kind: PeriodKind, key: string, steps: number): string {
  if (kind === 'all') return 'all';
  if (kind === 'month') {
    const [y, m] = key.split('-').map(Number) as [number, number];
    const d = new Date(Date.UTC(y, m - 1 + steps, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  }
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return isoDay(new Date(Date.UTC(y, m - 1, d + steps * 7)));
}

/** "2–6 Nov 2026" (Monday to Friday) for a week, "November 2026" for a month. */
export function periodLabel(kind: PeriodKind, key: string): string {
  if (kind === 'all') return 'All time';
  if (kind === 'month') {
    const [y, m] = key.split('-').map(Number) as [number, number];
    return `${MONTHS_LONG[m - 1]} ${y}`;
  }
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const mon = new Date(Date.UTC(y, m - 1, d));
  const fri = new Date(Date.UTC(y, m - 1, d + 4));
  const monM = MONTHS[mon.getUTCMonth()];
  const friM = MONTHS[fri.getUTCMonth()];
  if (mon.getUTCFullYear() !== fri.getUTCFullYear()) {
    return `${mon.getUTCDate()} ${monM} ${mon.getUTCFullYear()} – ${fri.getUTCDate()} ${friM} ${fri.getUTCFullYear()}`;
  }
  return monM === friM
    ? `${mon.getUTCDate()}–${fri.getUTCDate()} ${friM} ${y}`
    : `${mon.getUTCDate()} ${monM} – ${fri.getUTCDate()} ${friM} ${y}`;
}

const byOpen = <T extends AnalyticsTrade>(a: T, b: T) =>
  a.openedAt.getTime() - b.openedAt.getTime() || a.symbol.localeCompare(b.symbol);

function bySession<T extends AnalyticsTrade>(trades: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const t of [...trades].sort(byOpen)) {
    const k = sessionKeyOf(t.openedAt);
    out.set(k, [...(out.get(k) ?? []), t]);
  }
  return out;
}

/** One pick per session: the first backtest trade to open in each kill zone, on either index. */
export function onePickPerSession<T extends AnalyticsTrade>(trades: T[]): T[] {
  return [...bySession(trades).values()].map((list) => list[0] as T);
}

export type CompareSide = {
  /** Fractional when the side is an expected average per period. */
  trades: number;
  sessions: number;
  winRate: Decimal | null;
  /** R per trade, over trades with a known risk. */
  expectancyR: Decimal | null;
  /** Sum of R over trades with a known risk. */
  netR: Decimal | null;
  /** Net R per session traded. */
  rPerSession: Decimal | null;
  net: Decimal;
  rTrades: number;
};

/** Side summary; `per` > 1 turns totals into an average per period (rates are unchanged). */
export function summarize(trades: AnalyticsTrade[], scratchThresholdR: number, per = 1): CompareSide | null {
  if (trades.length === 0) return null;
  const s = tradeStats(trades, scratchThresholdR);
  const sessions = new Set(trades.map((t) => sessionKeyOf(t.openedAt))).size;
  const sessionsWithR = new Set(
    trades.filter((t) => rMultiple(t.netProfit, t.riskUsd) !== null).map((t) => sessionKeyOf(t.openedAt)),
  ).size;
  return {
    trades: trades.length / per,
    sessions: sessions / per,
    winRate: s.winRate,
    expectancyR: s.expectancyR,
    netR: s.netR ? s.netR.div(per) : null,
    rPerSession: s.netR && sessionsWithR ? s.netR.div(sessionsWithR) : null,
    net: s.net.div(per),
    rTrades: s.rTrades,
  };
}

export type CompareRow = {
  /** `all` for the both-indices total. */
  symbol: string;
  live: CompareSide | null;
  portfolio: CompareSide | null;
  onePick: CompareSide | null;
};

export type PickMatch = {
  /** Sessions where both live and backtest traded. */
  sessions: number;
  /** Of those, sessions where live's first trade was on the index the backtest triggered first. */
  matched: number;
  rate: Decimal | null;
};

export type Adherence = {
  /** Live trades with a journal "followed plan" answer. */
  answered: number;
  followed: number;
  rate: Decimal | null;
  followedSide: CompareSide | null;
  brokeSide: CompareSide | null;
};

export type LiveVsBacktest = {
  /**
   * `period`: backtest trades in the same period. `expected`: none there, so the backtest is its all-time
   * average per period that has backtest trades. `none`: no backtest trades at all.
   */
  basis: 'period' | 'expected' | 'none';
  /** Periods averaged over when basis = expected. */
  expectedOver: number;
  rows: CompareRow[];
  pickMatch: PickMatch;
  adherence: Adherence;
};

/** Gap = backtest R per trade − live R per trade, when both are known. */
export function gapR(live: CompareSide | null, backtest: CompareSide | null): Decimal | null {
  return live?.expectancyR && backtest?.expectancyR ? backtest.expectancyR.minus(live.expectancyR) : null;
}

/** Index pick match over sessions both sides traded. */
export function pickMatch(live: AnalyticsTrade[], backtest: AnalyticsTrade[]): PickMatch {
  const l = bySession(live);
  const b = bySession(backtest);
  let sessions = 0;
  let matched = 0;
  for (const [k, bt] of b) {
    const lv = l.get(k);
    if (!lv) continue;
    sessions += 1;
    if (lv[0]?.symbol === bt[0]?.symbol) matched += 1;
  }
  return { sessions, matched, rate: sessions ? new Decimal(matched).div(sessions) : null };
}

/**
 * The comparison for one period. `live` and `backtest` are every trade of each side; this picks the period's.
 * Backtest trades fall in the period of their replay (market) time, not the day the backtest was run.
 */
export function liveVsBacktestPeriod(
  live: CompareTrade[],
  backtest: AnalyticsTrade[],
  kind: PeriodKind,
  key: string,
  scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R,
): LiveVsBacktest {
  const inPeriod = <T extends AnalyticsTrade>(t: T) => periodKeyOf(kind, t.openedAt) === key;
  const l = live.filter(inPeriod);
  const periodBt = backtest.filter(inPeriod);
  let basis: LiveVsBacktest['basis'] = 'period';
  let bt = periodBt;
  let per = 1;
  if (backtest.length === 0) basis = 'none';
  else if (periodBt.length === 0) {
    basis = 'expected';
    bt = backtest;
    per = new Set(backtest.map((t) => periodKeyOf(kind, t.openedAt))).size;
  }
  const picks = onePickPerSession(bt);
  const symbols = [...new Set([...l, ...bt].map((t) => t.symbol))].sort();
  const row = (symbol: string, f: (t: AnalyticsTrade) => boolean): CompareRow => ({
    symbol,
    live: summarize(l.filter(f), scratchThresholdR),
    portfolio: summarize(bt.filter(f), scratchThresholdR, per),
    onePick: summarize(picks.filter(f), scratchThresholdR, per),
  });
  const answered = l.filter((t) => t.followedPlan === true || t.followedPlan === false);
  const followed = answered.filter((t) => t.followedPlan);
  return {
    basis,
    expectedOver: basis === 'expected' ? per : 0,
    rows: [row('all', () => true), ...symbols.map((s) => row(s, (t) => t.symbol === s))],
    pickMatch: basis === 'period' ? pickMatch(l, periodBt) : { sessions: 0, matched: 0, rate: null },
    adherence: {
      answered: answered.length,
      followed: followed.length,
      rate: answered.length ? new Decimal(followed.length).div(answered.length) : null,
      followedSide: summarize(followed, scratchThresholdR),
      brokeSide: summarize(
        answered.filter((t) => !t.followedPlan),
        scratchThresholdR,
      ),
    },
  };
}

/**
 * Where live net R lands against the backtest range (one pick … portfolio), and by how much it misses it.
 * Null when any of the three is unknown.
 */
export function rangePosition(
  row: CompareRow | undefined,
): { position: 'below' | 'inside' | 'above'; by: Decimal } | null {
  const live = row?.live?.netR;
  const lo = row?.onePick?.netR;
  const hi = row?.portfolio?.netR;
  if (!live || !lo || !hi) return null;
  const [min, max] = lo.lte(hi) ? [lo, hi] : [hi, lo];
  if (live.lt(min)) return { position: 'below', by: min.minus(live) };
  if (live.gt(max)) return { position: 'above', by: live.minus(max) };
  return { position: 'inside', by: new Decimal(0) };
}
