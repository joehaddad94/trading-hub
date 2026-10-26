'use client';

import type { OrderView, SessionView } from '@trading/backtest';
import { positionMetrics } from '@trading/backtest-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/action-result';

export type DeletedSnapshot = { trade: { id: string } } & Record<string, unknown>;

export type TradingActions = {
  place: (sessionId: string, input: unknown) => Promise<ActionResult<OrderView[]>>;
  advance: (sessionId: string, input: unknown) => Promise<ActionResult<OrderView[]>>;
  modify: (sessionId: string, orderId: string, input: unknown) => Promise<ActionResult<OrderView[]>>;
  cancel: (sessionId: string, orderId: string) => Promise<ActionResult<OrderView[]>>;
  close: (sessionId: string, orderId: string, input: unknown) => Promise<ActionResult<OrderView[]>>;
  remove: (tradeId: string) => Promise<ActionResult<DeletedSnapshot>>;
  restore: (snapshot: unknown) => Promise<ActionResult<void>>;
  list: (sessionId: string) => Promise<ActionResult<OrderView[]>>;
};

/** A long/short drawing as the trade ticket reads it: [entry, stop, target]. */
export type PositionDrawing = {
  side: 'long' | 'short';
  points: { ts: number; price: number }[];
  sizing: { mode: 'lots' | 'risk_usd' | 'risk_pct'; value: string } | undefined;
};

export const UNDO_MS = 10_000;
/** With no live orders, the cursor is saved once replay has been still this long. */
const CURSOR_SAVE_MS = 1_000;

/**
 * Simulated trading controller (backtester spec §6): places orders from position tools, replays them on the
 * server as the cursor moves (only up to the cursor), and handles close / cancel / breakeven / delete + undo.
 */
export function useTrading(opts: {
  session: SessionView | null;
  initialOrders: OrderView[];
  actions: TradingActions;
  cursor: number | null;
  instrument: { code: string; pointValue: string; priceDigits: number };
}) {
  const { session, actions, cursor, instrument } = opts;
  const [orders, setOrders] = useState<OrderView[]>(opts.initialOrders);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ snapshot: DeletedSnapshot; label: string } | null>(null);
  const inFlight = useRef<Promise<unknown> | null>(null);
  const queued = useRef<number | null>(null);
  const live = orders.some((o) => o.status === 'pending' || o.status === 'open');

  const apply = useCallback((result: ActionResult<OrderView[]>) => {
    if (result.ok) {
      setOrders(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    return result.ok;
  }, []);

  // Replay moved: evaluate pending/open orders on the bars up to the new cursor, one request at a time. With
  // nothing live the call only saves the session's cursor (for Resume), so it waits for replay to settle.
  useEffect(() => {
    if (!session || cursor === null) return;
    const send = () => {
      queued.current = cursor;
      const run = async () => {
        while (queued.current !== null) {
          const at = queued.current;
          queued.current = null;
          apply(await actions.advance(session.id, { at }));
        }
        inFlight.current = null;
      };
      if (!inFlight.current) inFlight.current = run();
    };
    if (live) {
      send();
      return;
    }
    const t = window.setTimeout(send, CURSOR_SAVE_MS);
    return () => window.clearTimeout(t);
  }, [session, cursor, live, actions, apply]);

  const place = useCallback(
    async (drawing: PositionDrawing, kind: 'market' | 'pending' | 'drawn', drawingId: string | null) => {
      if (!session || cursor === null) {
        setError('Start replay to place a simulated trade.');
        return false;
      }
      const [entry, stop, target] = drawing.points;
      if (!entry || !stop || !target) return false;
      const metrics = positionMetrics({
        side: drawing.side,
        entry: entry.price,
        stop: stop.price,
        target: target.price,
        pointValue: instrument.pointValue,
        balance: session.startingBalance,
        sizing: drawing.sizing ?? { mode: 'risk_pct', value: session.riskPct },
      });
      if (!metrics.valid || Number(metrics.lots) <= 0) {
        setError('This position has no valid size: check its stop, target and risk.');
        return false;
      }
      const fixed = (n: number) => n.toFixed(instrument.priceDigits);
      return apply(
        await actions.place(session.id, {
          instrument: instrument.code,
          side: drawing.side,
          kind,
          entry: fixed(entry.price),
          sl: fixed(stop.price),
          tp: fixed(target.price),
          lots: metrics.lots,
          at: cursor,
          drawingId,
        }),
      );
    },
    [session, cursor, instrument, actions, apply],
  );

  /** Closes at market; `lots` below the position size closes only that part. */
  const close = useCallback(
    async (id: string, lots?: string) => {
      if (!session || cursor === null) return;
      apply(await actions.close(session.id, id, { at: cursor, ...(lots ? { lots } : {}) }));
    },
    [session, cursor, actions, apply],
  );

  /** Closes every open position and cancels every pending order, one after the other (one replay engine). */
  const closeAll = useCallback(async () => {
    if (!session || cursor === null) return;
    for (const o of orders.filter((x) => x.status === 'open' || x.status === 'pending')) {
      const ok = apply(
        o.status === 'open'
          ? await actions.close(session.id, o.id, { at: cursor })
          : await actions.cancel(session.id, o.id),
      );
      if (!ok) return;
    }
  }, [session, cursor, orders, actions, apply]);

  const cancel = useCallback(
    async (id: string) => {
      if (session) apply(await actions.cancel(session.id, id));
    },
    [session, actions, apply],
  );

  /** New stop/target, and for a pending order optionally a new entry. */
  const modify = useCallback(
    async (id: string, levels: { sl: string; tp: string; entry?: string }) => {
      if (!session || cursor === null) return;
      apply(await actions.modify(session.id, id, { ...levels, at: cursor }));
    },
    [session, cursor, actions, apply],
  );

  const remove = useCallback(
    async (order: OrderView) => {
      if (!order.tradeId) return;
      const result = await actions.remove(order.tradeId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOrders((list) => list.filter((o) => o.id !== order.id));
      setUndo({ snapshot: result.data, label: `${order.instrument} ${order.side} ${order.net ?? ''}`.trim() });
    },
    [actions],
  );

  const restore = useCallback(async () => {
    if (!undo || !session) return;
    const snapshot = undo.snapshot;
    setUndo(null);
    const result = await actions.restore(snapshot);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    apply(await actions.list(session.id));
  }, [undo, session, actions, apply]);

  useEffect(() => {
    if (!undo) return;
    const t = window.setTimeout(() => setUndo(null), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [undo]);

  return { session, orders, error, place, close, closeAll, cancel, modify, remove, undo, restore };
}

export type Trading = ReturnType<typeof useTrading>;
