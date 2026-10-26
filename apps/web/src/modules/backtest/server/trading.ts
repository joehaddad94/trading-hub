import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { ModifyOrderInput, OrderView, PlaceOrderInput, SessionView } from '@trading/backtest';
import {
  advanceSession,
  assertOwnsOrder,
  assertOwnsSession,
  assertOwnsSnapshot,
  assertOwnsTrade,
  cancelOrder,
  closeOrder,
  currentSession,
  type DeletedTrade,
  deleteBacktestTrade,
  listOrders,
  modifyOrder,
  type Owner,
  placeOrder,
  restoreBacktestTrade,
  TradingError,
} from '@trading/backtest/server';
import type { ActionResult } from '@/lib/action-result';
import { getDb } from '@/lib/server/db';
import { backtestOwner } from '@/lib/server/viewer';

type Db = NonNullable<ReturnType<typeof getDb>>;

async function run<T>(fn: (db: Db, owner: Owner) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  const owner = await backtestOwner();
  if (owner === undefined) return { ok: false, error: 'Sign in again.' };
  try {
    return { ok: true, data: await fn(db, owner) };
  } catch (error) {
    if (error instanceof TradingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'The simulated trade could not be saved.' };
  }
}

export type TradingState = { session: SessionView; orders: OrderView[] };

/** The viewer's chart session (`?session=`, else their newest in progress) and its orders. */
export async function getTradingState(sessionId?: string | null): Promise<TradingState | null> {
  const db = getDb();
  const owner = await backtestOwner();
  if (!db || owner === undefined) return null;
  const session = await currentSession(db, owner, sessionId);
  return { session, orders: await listOrders(db, session.id) };
}

/**
 * Every mutation checks the run (and the order, when there is one) is the viewer's, then returns the run's
 * orders after it, replayed up to the cursor.
 */
const withOrders = (sessionId: string, fn: (db: Db) => Promise<unknown>, orderId?: string) =>
  run(async (db, owner) => {
    if (orderId) await assertOwnsOrder(db, owner, sessionId, orderId);
    else await assertOwnsSession(db, owner, sessionId);
    await fn(db);
    return listOrders(db, sessionId);
  });

export const placeSimOrder = (sessionId: string, input: PlaceOrderInput) =>
  withOrders(sessionId, async (db) => {
    await placeOrder(db, sessionId, input);
  });

export const advanceSimSession = (sessionId: string, at: Date) =>
  withOrders(sessionId, (db) => advanceSession(db, sessionId, at));

export const modifySimOrder = (sessionId: string, id: string, input: ModifyOrderInput) =>
  withOrders(sessionId, (db) => modifyOrder(db, id, input), id);

export const cancelSimOrder = (sessionId: string, id: string) => withOrders(sessionId, (db) => cancelOrder(db, id), id);

export const closeSimOrder = (sessionId: string, id: string, at: Date, lots?: string) =>
  withOrders(sessionId, (db) => closeOrder(db, id, at, lots), id);

export const deleteSimTrade = (tradeId: string) =>
  run(async (db, owner) => {
    await assertOwnsTrade(db, owner, tradeId);
    return deleteBacktestTrade(db, tradeId);
  });

export const restoreSimTrade = (snapshot: DeletedTrade) =>
  run(async (db, owner) => {
    await assertOwnsSnapshot(db, owner, snapshot);
    await restoreBacktestTrade(db, snapshot);
  });

export const sessionOrders = (sessionId: string) => withOrders(sessionId, async () => {});
