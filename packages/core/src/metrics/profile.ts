import Decimal from 'decimal.js';
import { type DayBoundary, DEFAULT_DAY_BOUNDARY, tradingDay } from '../time/days';
import { SESSIONS, type SessionName, sessionOf } from '../time/sessions';
import { type MetricTrade, tradeStats } from './metrics';

/** Tracker §8.3 screen 4: the same metrics for any group of trades (e.g. demo vs funded). */
export type ProfileTrade = MetricTrade & { openedAt: Date; closedAt: Date; lots: string };

export type TradingProfile = {
  trades: number;
  winRate: Decimal | null;
  avgWinR: Decimal | null;
  avgLossR: Decimal | null;
  expectancyR: Decimal | null;
  tradesPerDay: Decimal | null;
  avgHoldMs: number | null;
  avgLots: Decimal | null;
  /** Share of trades opened in each session (sums to 1). */
  sessionMix: Record<SessionName, Decimal>;
};

const ALL_SESSIONS: SessionName[] = [...SESSIONS.map((s) => s.name), 'outside'];

export function tradingProfile(
  trades: ProfileTrade[],
  opts: { boundary?: DayBoundary; scratchThresholdR?: number } = {},
): TradingProfile {
  const stats = tradeStats(trades, opts.scratchThresholdR);
  const days = new Set(trades.map((t) => tradingDay(t.closedAt, opts.boundary ?? DEFAULT_DAY_BOUNDARY)));
  const counts = new Map<SessionName, number>();
  for (const t of trades) counts.set(sessionOf(t.openedAt), (counts.get(sessionOf(t.openedAt)) ?? 0) + 1);
  const n = trades.length;
  return {
    trades: n,
    winRate: stats.winRate,
    avgWinR: stats.avgWinR,
    avgLossR: stats.avgLossR,
    expectancyR: stats.expectancyR,
    tradesPerDay: days.size ? new Decimal(n).div(days.size) : null,
    avgHoldMs: n ? Math.round(trades.reduce((s, t) => s + t.closedAt.getTime() - t.openedAt.getTime(), 0) / n) : null,
    avgLots: n ? Decimal.sum(...trades.map((t) => t.lots)).div(n) : null,
    sessionMix: Object.fromEntries(
      ALL_SESSIONS.map((s) => [s, n ? new Decimal(counts.get(s) ?? 0).div(n) : new Decimal(0)]),
    ) as Record<SessionName, Decimal>,
  };
}

export type ProfileKey = 'winRate' | 'avgWinR' | 'avgLossR' | 'expectancyR' | 'tradesPerDay' | 'avgHoldMs' | 'avgLots';

const KEYS: ProfileKey[] = ['winRate', 'avgWinR', 'avgLossR', 'expectancyR', 'tradesPerDay', 'avgHoldMs', 'avgLots'];

/** Metrics ordered by how much the two groups differ (relative to the larger magnitude). */
export function biggestDeltas(a: TradingProfile, b: TradingProfile): { key: ProfileKey; delta: Decimal }[] {
  return KEYS.flatMap((key) => {
    const x = a[key];
    const y = b[key];
    if (x === null || y === null) return [];
    const dx = new Decimal(x);
    const dy = new Decimal(y);
    const scale = Decimal.max(dx.abs(), dy.abs());
    if (scale.isZero()) return [];
    return [{ key, delta: dx.minus(dy).abs().div(scale) }];
  }).sort((p, q) => q.delta.comparedTo(p.delta));
}
