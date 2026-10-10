import { derivePointValue } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, eq, sql } from '@trading/db/orm';
import { accounts, symbolSpecs, trades } from '@trading/db/schema';

/**
 * Learns `symbol_specs.point_value_per_lot` from the firm's live trades for symbols that have no spec yet
 * (tracker §5: verified from data). Specs set by hand in Settings are never overwritten.
 */
export async function learnSymbolSpecs(db: Executor, firmId: string): Promise<string[]> {
  const missing = await db
    .selectDistinct({ symbol: trades.symbol })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(
      and(
        eq(accounts.firmId, firmId),
        eq(trades.source, 'live'),
        sql`not exists (select 1 from symbol_specs s where s.firm_id = ${firmId} and s.symbol = ${trades.symbol})`,
      ),
    );
  const learned: string[] = [];
  for (const { symbol } of missing) {
    const samples = await db
      .select({ lots: trades.lots, openPrice: trades.openPrice, closePrice: trades.closePrice, profit: trades.profit })
      .from(trades)
      .innerJoin(accounts, eq(accounts.id, trades.accountId))
      .where(and(eq(accounts.firmId, firmId), eq(trades.symbol, symbol), eq(trades.source, 'live')));
    const value = derivePointValue(samples);
    if (!value) continue;
    await db
      .insert(symbolSpecs)
      .values({ firmId, symbol, pointValuePerLot: value, verified: true })
      .onConflictDoNothing();
    learned.push(symbol);
  }
  return learned;
}
