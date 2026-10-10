import {
  breakdowns,
  DEFAULT_SCOPE,
  holdTimeStats,
  type LiveVsBacktestRow,
  liveVsBacktest,
  rDistribution,
  streaks,
} from '@trading/core';
import type { Executor } from '@trading/db';
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

/**
 * Live vs backtest (screen 8): every live trade against every backtest session's trades, per symbol. Live
 * trades use the scope picked in the header unless it is the Backtest scope, which falls back to all live.
 */
export async function liveVsBacktestReport(
  db: Executor,
  liveScope: ResolvedScope,
  scratchThresholdR: number,
): Promise<{ rows: LiveVsBacktestRow[]; live: number; backtest: number }> {
  const live = liveScope.source === 'live' ? liveScope : await resolveScope(db, DEFAULT_SCOPE);
  const [liveTrades, backtestTrades] = await Promise.all([
    scopedTrades(db, live),
    scopedTrades(db, await resolveScope(db, { kind: 'backtest' })),
  ]);
  return {
    rows: liveVsBacktest(liveTrades, backtestTrades, scratchThresholdR),
    live: liveTrades.length,
    backtest: backtestTrades.length,
  };
}
