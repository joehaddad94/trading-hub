import { TZDate } from '@date-fns/tz';
import type Decimal from 'decimal.js';
import { SESSION_LABELS, type SessionName, sessionOf } from '../time/sessions';
import {
  classify,
  DEFAULT_SCRATCH_THRESHOLD_R,
  type MetricTrade,
  rMultiple,
  type TradeStats,
  tradeStats,
} from './metrics';

/** A closed trade as the analytics screens read it (tracker spec §8.3 screens 7–8). */
export type AnalyticsTrade = MetricTrade & { symbol: string; openedAt: Date; closedAt: Date };

export type Group = { key: string; label: string; stats: TradeStats };

/** Stats per group, in the order `order` gives (groups without trades are left out). */
export function groupStats<T extends AnalyticsTrade>(
  trades: T[],
  keyOf: (t: T) => string,
  order: { key: string; label: string }[] | null = null,
  scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R,
): Group[] {
  const groups = new Map<string, T[]>();
  for (const t of trades) {
    const k = keyOf(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const keys = order ?? [...groups.keys()].sort().map((key) => ({ key, label: key }));
  return keys.flatMap(({ key, label }) => {
    const list = groups.get(key);
    return list ? [{ key, label, stats: tradeStats(list, scratchThresholdR) }] : [];
  });
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** P/L by symbol, session (by open time, New York kill zones), hour and weekday of the open in `timezone`. */
export function breakdowns(
  trades: AnalyticsTrade[],
  timezone: string,
  scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R,
) {
  const local = (d: Date) => new TZDate(d.getTime(), timezone);
  const sessions = (Object.keys(SESSION_LABELS) as SessionName[]).map((key) => ({ key, label: SESSION_LABELS[key] }));
  const hours = Array.from({ length: 24 }, (_, h) => ({ key: String(h), label: `${String(h).padStart(2, '0')}:00` }));
  const days = WEEKDAYS.map((label, i) => ({ key: String(i), label }));
  return {
    symbol: groupStats(trades, (t) => t.symbol, null, scratchThresholdR),
    session: groupStats(trades, (t) => sessionOf(t.openedAt), sessions, scratchThresholdR),
    hour: groupStats(trades, (t) => String(local(t.openedAt).getHours()), hours, scratchThresholdR),
    weekday: groupStats(trades, (t) => String((local(t.openedAt).getDay() + 6) % 7), days, scratchThresholdR),
  };
}

export type RBin = { from: number | null; to: number | null; label: string; count: number };

/**
 * R histogram: half-R bins from −3R to +5R, plus "< −3R" and "≥ 5R". Trades without a known risk are counted
 * separately (they have no R).
 */
export function rDistribution(trades: MetricTrade[], step = 0.5, min = -3, max = 5): { bins: RBin[]; unknown: number } {
  const edges: number[] = [];
  for (let x = min; x < max - 1e-9; x += step) edges.push(Number(x.toFixed(4)));
  const bins: RBin[] = [
    { from: null, to: min, label: `< ${min}R`, count: 0 },
    ...edges.map((from) => ({ from, to: Number((from + step).toFixed(4)), label: `${from}R`, count: 0 })),
    { from: max, to: null, label: `≥ ${max}R`, count: 0 },
  ];
  let unknown = 0;
  for (const t of trades) {
    const r = rMultiple(t.netProfit, t.riskUsd);
    if (r === null) {
      unknown += 1;
      continue;
    }
    const v = r.toNumber();
    const bin = bins.find((b) => (b.from === null || v >= b.from) && (b.to === null || v < b.to));
    if (bin) bin.count += 1;
  }
  return { bins, unknown };
}

export type Streaks = {
  longestWin: number;
  longestLoss: number;
  /** The run the most recent trades are on (scratches end a run and start none). */
  current: { kind: 'win' | 'loss' | null; length: number };
};

/** Win and loss streaks by close time. A scratch breaks a streak. */
export function streaks(
  trades: (MetricTrade & { closedAt: Date })[],
  scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R,
): Streaks {
  const sorted = [...trades].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  let longestWin = 0;
  let longestLoss = 0;
  let kind: 'win' | 'loss' | null = null;
  let length = 0;
  for (const t of sorted) {
    const o = classify(t, scratchThresholdR);
    if (o === 'scratch') {
      kind = null;
      length = 0;
      continue;
    }
    length = o === kind ? length + 1 : 1;
    kind = o;
    if (o === 'win') longestWin = Math.max(longestWin, length);
    else longestLoss = Math.max(longestLoss, length);
  }
  return { longestWin, longestLoss, current: { kind, length } };
}

const HOLD_BUCKETS: { key: string; label: string; upToMs: number }[] = [
  { key: 'lt1m', label: '< 1 min', upToMs: 60_000 },
  { key: '1-5m', label: '1–5 min', upToMs: 5 * 60_000 },
  { key: '5-15m', label: '5–15 min', upToMs: 15 * 60_000 },
  { key: '15-60m', label: '15–60 min', upToMs: 60 * 60_000 },
  { key: '1-4h', label: '1–4 h', upToMs: 4 * 3600_000 },
  { key: 'gt4h', label: '> 4 h', upToMs: Number.POSITIVE_INFINITY },
];

/** Hold time vs outcome: stats per hold-time bucket. */
export function holdTimeStats(trades: AnalyticsTrade[], scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R): Group[] {
  return groupStats(
    trades,
    (t) => {
      const ms = t.closedAt.getTime() - t.openedAt.getTime();
      return (HOLD_BUCKETS.find((b) => ms < b.upToMs) ?? (HOLD_BUCKETS.at(-1) as (typeof HOLD_BUCKETS)[number])).key;
    },
    HOLD_BUCKETS,
    scratchThresholdR,
  );
}

export type LiveVsBacktestRow = {
  symbol: string;
  live: TradeStats | null;
  backtest: TradeStats | null;
  /** Backtest expectancy R − live expectancy R, when both are known. */
  expectancyGapR: Decimal | null;
};

/** Live vs backtest per symbol (screen 8): the same metrics side by side, symbols present in either. */
export function liveVsBacktest(
  live: AnalyticsTrade[],
  backtest: AnalyticsTrade[],
  scratchThresholdR = DEFAULT_SCRATCH_THRESHOLD_R,
): LiveVsBacktestRow[] {
  const symbols = [...new Set([...live, ...backtest].map((t) => t.symbol))].sort();
  const rows = symbols.map((symbol) => {
    const l = live.filter((t) => t.symbol === symbol);
    const b = backtest.filter((t) => t.symbol === symbol);
    const ls = l.length ? tradeStats(l, scratchThresholdR) : null;
    const bs = b.length ? tradeStats(b, scratchThresholdR) : null;
    const gap = ls?.expectancyR && bs?.expectancyR ? bs.expectancyR.minus(ls.expectancyR) : null;
    return { symbol, live: ls, backtest: bs, expectancyGapR: gap };
  });
  const all = {
    symbol: 'All symbols',
    live: live.length ? tradeStats(live, scratchThresholdR) : null,
    backtest: backtest.length ? tradeStats(backtest, scratchThresholdR) : null,
    expectancyGapR: null as Decimal | null,
  };
  if (all.live?.expectancyR && all.backtest?.expectancyR) {
    all.expectancyGapR = all.backtest.expectancyR.minus(all.live.expectancyR);
  }
  return symbols.length > 1 ? [...rows, all] : rows;
}
