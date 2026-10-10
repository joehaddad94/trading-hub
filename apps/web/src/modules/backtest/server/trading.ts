import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { ModifyOrderInput, OrderView, PlaceOrderInput, SessionView } from '@trading/backtest';
import {
  advanceSession,
  cancelOrder,
  closeOrder,
  currentSession,
  type DeletedTrade,
  deleteBacktestTrade,
  listOrders,
  modifyOrder,
  placeOrder,
  restoreBacktestTrade,
  TradingError,
} from '@trading/backtest/server';
import type { ActionResult } from '@/lib/action-result';
import { getDb } from '@/lib/server/db';

type Db = NonNullable<ReturnType<typeof getDb>>;

async function run<T>(fn: (db: Db) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  try {
    return { ok: true, data: await fn(db) };
  } catch (error) {
    if (error instanceof TradingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'The simulated trade could not be saved.' };
  }
}

export type TradingState = { session: SessionView; orders: OrderView[] };

/** The chart's session and its orders (null without a database). */
export async function getTradingState(): Promise<TradingState | null> {
  const db = getDb();
  if (!db) return null;
  const session = await currentSession(db);
  return { session, orders: await listOrders(db, session.id) };
}

/** Every mutation returns the session's orders after it, replayed up to the cursor. */
const withOrders = (sessionId: string, fn: (db: Db) => Promise<unknown>) =>
  run(async (db) => {
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
  withOrders(sessionId, (db) => modifyOrder(db, id, input));

export const cancelSimOrder = (sessionId: string, id: string) => withOrders(sessionId, (db) => cancelOrder(db, id));

export const closeSimOrder = (sessionId: string, id: string, at: Date) =>
  withOrders(sessionId, (db) => closeOrder(db, id, at));

export const deleteSimTrade = (tradeId: string) => run((db) => deleteBacktestTrade(db, tradeId));

export const restoreSimTrade = (snapshot: DeletedTrade) => run((db) => restoreBacktestTrade(db, snapshot));

export const sessionOrders = (sessionId: string) => run((db) => listOrders(db, sessionId));
