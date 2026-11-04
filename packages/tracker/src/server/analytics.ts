import {
  breakdowns,
  type CompareTrade,
  DEFAULT_SCOPE,
  holdTimeStats,
  isPeriodKey,
  type LiveVsBacktest,
  liveVsBacktestPeriod,
  type PeriodKind,
  periodKeyOf,
  periodLabel,
  rDistribution,
  shiftPeriod,
  streaks,
} from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, eq, inArray } from '@trading/db/orm';
import { journalEntries, trades } from '@trading/db/schema';
import { type ResolvedScope, resolveScope } from './scope';
import { scopedTrades } from './trades';

export type AnalyticsOptions = { timezone: string; scratchThresholdR: number };

/** Analytics screen (tracker spec §8.3 screen 7): every breakdown of the scope's closed trades. */
export async function analytics(db: Executor, scope: ResolvedScope, { timezone, scratchThresholdR }: AnalyticsOptions) {
  const trades = await scopedTrades(db, scope);
  return {
    trades: trades.length,
    breakdowns: breakdowns(trades, timezone, scratchThresholdR),
    r: rDistribution(trades),
    streaks: streaks(trades, scratchThresholdR),
    holdTime: holdTimeStats(trades, scratchThresholdR),
  };
}

export type AnalyticsData = Awaited<ReturnType<typeof analytics>>;

/** Closed trades of a scope with the journal's "followed plan" answer, for live vs backtest. */
async function compareTrades(db: Executor, scope: ResolvedScope): Promise<CompareTrade[]> {
  if (scope.accountIds.length === 0) return [];
  return db
    .select({
      symbol: trades.symbol,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      netProfit: trades.netProfit,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
      followedPlan: journalEntries.followedPlan,
    })
    .from(trades)
    .leftJoin(journalEntries, eq(journalEntries.tradeId, trades.id))
    .where(and(inArray(trades.accountId, scope.accountIds), eq(trades.source, scope.source)))
    .orderBy(asc(trades.openedAt));
}

export type LiveVsBacktestReport = LiveVsBacktest & {
  period: { kind: PeriodKind; key: string; label: string; prev: string | null; next: string | null };
  /** Trade counts over all time, per side. */
  live: number;
  backtest: number;
};

/**
 * Live vs backtest (screen 8, Joe 4 Nov 2026): compares by kill-zone session with the backtest as a portfolio
 * of both indices and as one pick per session. Live trades use the header scope unless it is the Backtest
 * scope, which falls back to all live. With no `key`, the period holding the latest live trade is shown.
 */
export async function liveVsBacktestReport(
  db: Executor,
  liveScope: ResolvedScope,
  scratchThresholdR: number,
  { kind = 'all', key = null, now = new Date() }: { kind?: PeriodKind; key?: string | null; now?: Date } = {},
): Promise<LiveVsBacktestReport> {
  const liveResolved = liveScope.source === 'live' ? liveScope : await resolveScope(db, DEFAULT_SCOPE);
  const [live, backtest] = await Promise.all([
    compareTrades(db, liveResolved),
    compareTrades(db, await resolveScope(db, { kind: 'backtest' })),
  ]);
  const latest = live.at(-1)?.openedAt ?? backtest.at(-1)?.openedAt ?? now;
  const k = key && isPeriodKey(kind, key) ? key : periodKeyOf(kind, latest);
  const current = periodKeyOf(kind, now);
  const firstAt = [live[0]?.openedAt, backtest[0]?.openedAt].filter((d): d is Date => !!d);
  const first = firstAt.length ? periodKeyOf(kind, new Date(Math.min(...firstAt.map((d) => d.getTime())))) : k;
  const prev = kind === 'all' ? null : shiftPeriod(kind, k, -1);
  const next = kind === 'all' ? null : shiftPeriod(kind, k, 1);
  return {
    ...liveVsBacktestPeriod(live, backtest, kind, k, scratchThresholdR),
    period: {
      kind,
      key: k,
      label: periodLabel(kind, k),
      prev: prev && prev >= first ? prev : null,
      next: next && next <= current ? next : null,
    },
    live: live.length,
    backtest: backtest.length,
  };
}
