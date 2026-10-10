'use server';

import { cursorSchema, modifyOrderSchema, type OrderView, placeOrderSchema } from '@trading/backtest';
import type { DeletedTrade } from '@trading/backtest/server';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import {
  advanceSimSession,
  cancelSimOrder,
  closeSimOrder,
  deleteSimTrade,
  modifySimOrder,
  placeSimOrder,
  restoreSimTrade,
  sessionOrders,
} from '@/modules/backtest/server/trading';

function invalid(error: z.ZodError): { ok: false; error: string } {
  const issue = error.issues[0];
  return { ok: false, error: issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input.' };
}

const id = z.uuid();

/** Backtester spec §6.1: "Place trade" from a long/short tool during replay. */
export async function placeOrderAction(sessionId: string, input: unknown): Promise<ActionResult<OrderView[]>> {
  const parsed = z.object({ sessionId: id, input: placeOrderSchema }).safeParse({ sessionId, input });
  if (!parsed.success) return invalid(parsed.error);
  return placeSimOrder(parsed.data.sessionId, parsed.data.input);
}

/** Replays the session's orders up to the cursor (called as replay moves). */
export async function advanceAction(sessionId: string, input: unknown): Promise<ActionResult<OrderView[]>> {
  const parsed = z.object({ sessionId: id, input: cursorSchema }).safeParse({ sessionId, input });
  if (!parsed.success) return invalid(parsed.error);
  return advanceSimSession(parsed.data.sessionId, parsed.data.input.at);
}

export async function modifyOrderAction(
  sessionId: string,
  orderId: string,
  input: unknown,
): Promise<ActionResult<OrderView[]>> {
  const parsed = z
    .object({ sessionId: id, orderId: id, input: modifyOrderSchema })
    .safeParse({ sessionId, orderId, input });
  if (!parsed.success) return invalid(parsed.error);
  return modifySimOrder(parsed.data.sessionId, parsed.data.orderId, parsed.data.input);
}

export async function cancelOrderAction(sessionId: string, orderId: string): Promise<ActionResult<OrderView[]>> {
  const parsed = z.object({ sessionId: id, orderId: id }).safeParse({ sessionId, orderId });
  if (!parsed.success) return invalid(parsed.error);
  return cancelSimOrder(parsed.data.sessionId, parsed.data.orderId);
}

export async function closeOrderAction(
  sessionId: string,
  orderId: string,
  input: unknown,
): Promise<ActionResult<OrderView[]>> {
  const parsed = z.object({ sessionId: id, orderId: id, input: cursorSchema }).safeParse({ sessionId, orderId, input });
  if (!parsed.success) return invalid(parsed.error);
  return closeSimOrder(parsed.data.sessionId, parsed.data.orderId, parsed.data.input.at);
}

/** Spec §6.4: deletes a backtest trade (never a live one) and returns what Undo needs. */
export async function deleteTradeAction(tradeId: string): Promise<ActionResult<DeletedTrade>> {
  const parsed = id.safeParse(tradeId);
  if (!parsed.success) return invalid(parsed.error);
  return deleteSimTrade(parsed.data);
}

const snapshotSchema = z
  .object({
    trade: z.object({ id, accountId: id, source: z.literal('backtest') }).loose(),
    journal: z.array(z.object({ tradeId: id }).loose()),
    tags: z.array(z.object({ tradeId: id }).loose()),
    screenshots: z.array(z.object({ tradeId: id }).loose()),
    orders: z.array(z.object({ tradeId: id }).loose()),
  })
  .refine(
    (s) => [...s.journal, ...s.tags, ...s.screenshots, ...s.orders].every((r) => r.tradeId === s.trade.id),
    'snapshot rows belong to another trade',
  );

/** Undo within the toast's window: re-inserts the deleted backtest trade as it was. */
export async function restoreTradeAction(snapshot: unknown): Promise<ActionResult<void>> {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) return invalid(parsed.error);
  return restoreSimTrade(snapshot as DeletedTrade);
}

export async function ordersAction(sessionId: string): Promise<ActionResult<OrderView[]>> {
  const parsed = id.safeParse(sessionId);
  if (!parsed.success) return invalid(parsed.error);
  return sessionOrders(parsed.data);
}
