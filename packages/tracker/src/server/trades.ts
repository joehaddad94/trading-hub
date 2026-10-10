import type { Executor } from '@trading/db';
import { and, asc, eq, gte, inArray, lt } from '@trading/db/orm';
import { trades } from '@trading/db/schema';
import type { ResolvedScope } from './scope';

export type ScopedTrade = {
  id: string;
  accountId: string;
  symbol: string;
  side: 'buy' | 'sell';
  openedAt: Date;
  closedAt: Date;
  netProfit: string;
  riskUsd: string | null;
  riskSource: (typeof trades.$inferSelect)['riskSource'];
};

/** Closed trades in scope, by close time, optionally within [from, to). */
export async function scopedTrades(
  db: Executor,
  scope: ResolvedScope,
  range: { from?: Date; to?: Date } = {},
): Promise<ScopedTrade[]> {
  if (scope.accountIds.length === 0) return [];
  const where = [inArray(trades.accountId, scope.accountIds), eq(trades.source, scope.source)];
  if (range.from) where.push(gte(trades.closedAt, range.from));
  if (range.to) where.push(lt(trades.closedAt, range.to));
  return db
    .select({
      id: trades.id,
      accountId: trades.accountId,
      symbol: trades.symbol,
      side: trades.side,
      openedAt: trades.openedAt,
      closedAt: trades.closedAt,
      netProfit: trades.netProfit,
      riskUsd: trades.riskUsd,
      riskSource: trades.riskSource,
    })
    .from(trades)
    .where(and(...where))
    .orderBy(asc(trades.closedAt), asc(trades.ticket));
}
