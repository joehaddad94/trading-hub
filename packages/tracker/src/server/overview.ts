import { type Drawdown, equityCurve, maxDrawdown, type TradeStats, tradeStats } from '@trading/core';
import type { Executor } from '@trading/db';
import { sql } from '@trading/db/orm';
import { cashflows } from '@trading/db/schema';
import Decimal from 'decimal.js';
import type { ResolvedScope } from './scope';
import { DEFAULT_SETTINGS, type TrackerSettings } from './settings';
import { scopedTrades } from './trades';

export type NetPropResult = { payouts: Decimal; fees: Decimal; net: Decimal };

export type OverviewData = {
  stats: TradeStats;
  maxDrawdown: Drawdown;
  /** Combined equity curve (§6): cumulative net P/L in close order from 0. */
  equity: { at: Date; equity: Decimal; accountId: string }[];
  /** Where the curve moves to a different account than the previous trade (account boundaries). */
  boundaries: { at: Date; accountId: string }[];
  netPropResult: NetPropResult;
};

/** Net prop result (§6): Σ payouts − Σ fees, across every account ever. Fees are stored negative. */
export async function netPropResult(db: Executor): Promise<NetPropResult> {
  const [row] = await db
    .select({
      payouts: sql<string>`coalesce(sum(${cashflows.amountUsd}) filter (where ${cashflows.amountUsd} > 0), 0)::text`,
      fees: sql<string>`coalesce(sum(${cashflows.amountUsd}) filter (where ${cashflows.amountUsd} < 0), 0)::text`,
    })
    .from(cashflows);
  const payouts = new Decimal(row?.payouts ?? 0);
  const fees = new Decimal(row?.fees ?? 0).abs();
  return { payouts, fees, net: payouts.minus(fees) };
}

/** Tracker Overview (§8.3 screen 1), scoped. */
export async function overview(
  db: Executor,
  scope: ResolvedScope,
  settings: TrackerSettings = DEFAULT_SETTINGS,
): Promise<OverviewData> {
  const list = await scopedTrades(db, scope);
  const equity = equityCurve(list).map((p) => ({ ...p, accountId: p.accountId ?? '' }));
  const sorted = [...list].sort((a, b) => a.closedAt.getTime() - b.closedAt.getTime());
  const boundaries = sorted.flatMap((t, i) =>
    i === 0 || sorted[i - 1]?.accountId !== t.accountId ? [{ at: t.closedAt, accountId: t.accountId }] : [],
  );
  return {
    stats: tradeStats(list, settings.scratchThresholdR),
    maxDrawdown: maxDrawdown(sorted.map((t) => t.netProfit)),
    equity,
    boundaries,
    netPropResult: await netPropResult(db),
  };
}
