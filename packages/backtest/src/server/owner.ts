import type { Executor } from '@trading/db';
import { and, eq } from '@trading/db/orm';
import { backtestOrders, backtestSessions, trades } from '@trading/db/schema';
import { type Owner, ownedBy } from './owned-by';
import { type DeletedTrade, TradingError } from './trading';

/** Someone else's run looks exactly like a missing one. */
const GONE = 'That backtest run no longer exists.';

export async function assertOwnsSession(db: Executor, owner: Owner, sessionId: string): Promise<void> {
  const [row] = await db
    .select({ id: backtestSessions.id })
    .from(backtestSessions)
    .where(and(eq(backtestSessions.id, sessionId), ownedBy(backtestSessions.ownerId, owner)));
  if (!row) throw new TradingError(GONE);
}

/** The order must be in this session, and the session the caller's. */
export async function assertOwnsOrder(db: Executor, owner: Owner, sessionId: string, orderId: string): Promise<void> {
  await assertOwnsSession(db, owner, sessionId);
  const [row] = await db
    .select({ id: backtestOrders.id })
    .from(backtestOrders)
    .where(and(eq(backtestOrders.id, orderId), eq(backtestOrders.sessionId, sessionId)));
  if (!row) throw new TradingError('That order no longer exists.');
}

async function sessionOfAccount(db: Executor, owner: Owner, accountId: string) {
  const [row] = await db
    .select({ id: backtestSessions.id })
    .from(backtestSessions)
    .where(and(eq(backtestSessions.accountId, accountId), ownedBy(backtestSessions.ownerId, owner)));
  if (!row) throw new TradingError(GONE);
  return row.id;
}

/** A backtest trade belongs to whoever owns its run's synthetic account. */
export async function assertOwnsTrade(db: Executor, owner: Owner, tradeId: string): Promise<void> {
  const [row] = await db
    .select({ accountId: trades.accountId })
    .from(trades)
    .where(and(eq(trades.id, tradeId), eq(trades.source, 'backtest')));
  if (!row) throw new TradingError('That trade no longer exists.');
  await sessionOfAccount(db, owner, row.accountId);
}

/**
 * Undo sends the deleted trade back from the browser: it must go into the caller's own run, with its orders
 * in that same run. Invited users have no tags or screenshots to bring back (the run's own SL journal is fine).
 */
export async function assertOwnsSnapshot(db: Executor, owner: Owner, snapshot: DeletedTrade): Promise<void> {
  const sessionId = await sessionOfAccount(db, owner, snapshot.trade.accountId);
  if (snapshot.orders.some((o) => o.sessionId !== sessionId)) throw new TradingError(GONE);
  if (owner !== null && (snapshot.tags.length || snapshot.screenshots.length)) {
    throw new TradingError(GONE);
  }
}
