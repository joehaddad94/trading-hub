import { createDb, type Tx } from '@trading/db';
import { eq } from '@trading/db/orm';
import { accounts, backtestOrders, candles1m, instruments, journalEntries, trades } from '@trading/db/schema';
import { afterAll, describe, expect, it } from 'vitest';
import {
  advanceSession,
  BEHIND_LIVE_TRADE,
  cancelOrder,
  closeOrder,
  createSession,
  currentSession,
  deleteBacktestTrade,
  deleteSession,
  getSessionView,
  listOrders,
  listSessions,
  modifyOrder,
  placeOrder,
  restoreBacktestTrade,
  sessionTrades,
  setSessionStatus,
  TradingError,
  updateSession,
} from '../src/server';
import { placeOrderSchema } from '../src/trading';

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : undefined;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}

async function inTx(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const M = 60_000;
const T0 = Date.UTC(2026, 9, 7, 14, 0);
const at = (i: number) => new Date(T0 + i * M);

/** US30 1m bars: [open, high, low, close] from minute 0. */
async function seedBars(tx: Tx, bars: [number, number, number, number][]) {
  const [us30] = await tx.select().from(instruments).where(eq(instruments.code, 'US30'));
  await tx.insert(candles1m).values(
    bars.map(([open, high, low, close], i) => ({
      instrumentId: us30?.id as string,
      ts: at(i),
      open: String(open),
      high: String(high),
      low: String(low),
      close: String(close),
      volume: '1',
    })),
  );
}

const order = (o: Record<string, unknown>) =>
  placeOrderSchema.parse({
    instrument: 'US30',
    side: 'long',
    kind: 'market',
    entry: '100',
    sl: '90',
    tp: '120',
    lots: '0.5',
    at: T0,
    ...o,
  });

describe.skipIf(!url)('simulated trading', () => {
  it('a market long fills at the next open + spread, hits TP and becomes a backtest trade with R', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 104, 99, 103], // fill at 100 + 2 spread = 102; SL 92, TP 122
        [103, 110, 101, 109],
        [109, 123, 108, 121], // TP
      ]);
      const session = await createSession(tx, null, { name: 'Test' });
      const placed = await placeOrder(tx, session.id, order({}));
      expect(placed).toMatchObject({ status: 'pending', type: 'market' });

      // Cursor at minute 2: open, no lookahead to the TP bar.
      await advanceSession(tx, session.id, at(2));
      let [o] = await listOrders(tx, session.id);
      expect(o).toMatchObject({ status: 'open', fillPrice: '102.00000', sl: '92.00000', tp: '122.00000' });

      await advanceSession(tx, session.id, at(3));
      [o] = await listOrders(tx, session.id);
      expect(o).toMatchObject({ status: 'closed', exitReason: 'tp', closePrice: '122.00000' });
      // (122 − 102) × 10 × 0.5 = 100; risk (102 − 92) × 10 × 0.5 = 50 → 2R.
      expect(o?.net).toBe('100.00');
      expect(o?.r).toBe('2.00');

      const [trade] = await tx
        .select()
        .from(trades)
        .where(eq(trades.id, o?.tradeId as string));
      expect(trade).toMatchObject({ source: 'backtest', symbol: 'US30', side: 'buy', riskUsd: '50.00' });
      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.id, trade?.accountId as string));
      expect(account).toMatchObject({ isBacktest: true, phase: 'other', typeLabel: 'Backtest – Test' });
      const [journal] = await tx
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.tradeId, trade?.id as string));
      expect(journal?.initialSl).toBe('92.00000');
    });
  });

  it('pending orders: limit vs stop from the cursor price; cancel; modify is logged', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 101, 99, 100],
      ]);
      const session = await createSession(tx, null, { name: 'P' });
      const limit = await placeOrder(tx, session.id, order({ kind: 'pending', entry: '95', sl: '90', tp: '105' }));
      const stop = await placeOrder(tx, session.id, order({ kind: 'pending', entry: '105', sl: '100', tp: '115' }));
      expect([limit.type, stop.type]).toEqual(['limit', 'stop']);
      await modifyOrder(tx, limit.id, { sl: '91', tp: '106', at: at(1) });
      const [row] = await tx.select().from(backtestOrders).where(eq(backtestOrders.id, limit.id));
      expect(row?.modifications).toEqual([{ at: at(1).toISOString(), sl: '91', tp: '106' }]);
      await expect(modifyOrder(tx, limit.id, { sl: '96', tp: '106', at: at(1) })).rejects.toThrow(TradingError);
      await cancelOrder(tx, stop.id);
      expect((await listOrders(tx, session.id)).map((o) => o.id)).toEqual([limit.id]);
    });
  });

  it('rejects bad levels and placing without candles', async () => {
    await inTx(async (tx) => {
      const session = await createSession(tx, null, { name: 'X' });
      await expect(placeOrder(tx, session.id, order({ sl: '110' }))).rejects.toThrow(/stop below/);
      await expect(placeOrder(tx, session.id, order({}))).rejects.toThrow(/No candles/);
    });
  });

  it('moves a pending entry and re-types it against the cursor bar', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 101, 99, 100],
      ]);
      const session = await createSession(tx, null, { name: 'E' });
      const limit = await placeOrder(tx, session.id, order({ kind: 'pending', entry: '95', sl: '90', tp: '105' }));
      // Dragged above the price: a buy limit becomes a buy stop.
      await modifyOrder(tx, limit.id, { entry: '103', sl: '98', tp: '110', at: at(1) });
      const [row] = await tx.select().from(backtestOrders).where(eq(backtestOrders.id, limit.id));
      expect(row).toMatchObject({ type: 'stop', entry: '103.00000' });
      expect(row?.modifications).toEqual([{ at: at(1).toISOString(), sl: '98', tp: '110', entry: '103' }]);
      await expect(modifyOrder(tx, limit.id, { entry: '89', sl: '98', tp: '110', at: at(1) })).rejects.toThrow(
        TradingError,
      );
      // A market order waiting for the next open keeps its entry.
      const market = await placeOrder(tx, session.id, order({}));
      await expect(modifyOrder(tx, market.id, { entry: '99', sl: '90', tp: '120', at: at(1) })).rejects.toThrow(
        /market order/,
      );
    });
  });

  it('a partial close books part of the position and keeps the rest open', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 106, 99, 105],
      ]);
      const session = await createSession(tx, null, { name: 'P' });
      const placed = await placeOrder(tx, session.id, order({}));
      await expect(closeOrder(tx, placed.id, at(2), '0.60')).rejects.toThrow(/only 0.50 lots/);
      await closeOrder(tx, placed.id, at(2), '0.20');
      const list = await listOrders(tx, session.id);
      const open = list.find((o) => o.status === 'open');
      const closed = list.find((o) => o.status === 'closed');
      expect(open).toMatchObject({ id: placed.id, lots: '0.30' });
      // 0.2 lots filled at 102, out at 105.
      expect(closed).toMatchObject({ lots: '0.20', exitReason: 'manual', net: '6.00' });
      await closeOrder(tx, placed.id, at(2));
      expect((await listOrders(tx, session.id)).every((o) => o.status === 'closed')).toBe(true);
    });
  });

  it('close at market, delete with undo, delete the session', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 106, 99, 105],
      ]);
      const session = await createSession(tx, null, { name: 'C' });
      const placed = await placeOrder(tx, session.id, order({}));
      await closeOrder(tx, placed.id, at(2));
      const [closed] = await listOrders(tx, session.id);
      // Filled at 102, closed at the cursor bar's close 105.
      expect(closed).toMatchObject({ status: 'closed', exitReason: 'manual', closePrice: '105.00000', net: '15.00' });

      const snapshot = await deleteBacktestTrade(tx, closed?.tradeId as string);
      expect(await listOrders(tx, session.id)).toEqual([]);
      await restoreBacktestTrade(tx, snapshot);
      expect((await listOrders(tx, session.id))[0]).toMatchObject({ id: placed.id, net: '15.00' });

      await deleteSession(tx, session.id);
      expect(await tx.select().from(accounts).where(eq(accounts.id, session.accountId))).toEqual([]);
      expect(
        await tx
          .select()
          .from(trades)
          .where(eq(trades.id, closed?.tradeId as string)),
      ).toEqual([]);
    });
  });

  it('refuses anything dated before an open trade, so it never closes before it opened', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 101, 99, 100],
        [100, 103, 99, 102],
        [102, 104, 101, 103],
        [103, 105, 102, 104],
      ]);
      const session = await createSession(tx, null, { name: 'Behind' });
      const placed = await placeOrder(tx, session.id, order({}));
      await advanceSession(tx, session.id, at(4));
      expect((await listOrders(tx, session.id))[0]).toMatchObject({ status: 'open' });

      // The replay jumped back to minute 1: nothing may be closed, moved, placed or replayed there.
      await expect(advanceSession(tx, session.id, at(1))).rejects.toThrow(BEHIND_LIVE_TRADE);
      await expect(closeOrder(tx, placed.id, at(1))).rejects.toThrow(BEHIND_LIVE_TRADE);
      await expect(modifyOrder(tx, placed.id, { sl: '95', tp: '120', at: at(1) })).rejects.toThrow(BEHIND_LIVE_TRADE);
      await expect(placeOrder(tx, session.id, order({ at: at(1).getTime() }))).rejects.toThrow(BEHIND_LIVE_TRADE);

      // Back where it left off, it closes normally, after its fill.
      await closeOrder(tx, placed.id, at(4));
      const [closed] = await listOrders(tx, session.id);
      expect(closed).toMatchObject({ status: 'closed', closePrice: '104.00000' });
      expect((closed?.closedAt ?? 0) > (closed?.filledAt ?? Infinity)).toBe(true);
    });
  });

  it('refuses to delete a live trade', async () => {
    await inTx(async (tx) => {
      const [live] = await tx.select({ id: trades.id }).from(trades).where(eq(trades.source, 'live')).limit(1);
      if (!live) {
        await expect(deleteBacktestTrade(tx, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(TradingError);
        return;
      }
      await expect(deleteBacktestTrade(tx, live.id)).rejects.toThrow(/never be deleted/);
    });
  });

  it('current session is created once and numbered', async () => {
    await inTx(async (tx) => {
      const a = await currentSession(tx, null);
      const b = await currentSession(tx, null);
      expect(a.id).toBe(b.id);
      expect(a.name).toMatch(/^Run \d+$/);
    });
  });

  it('lists, edits, completes and reopens sessions; session trades carry exit reason', async () => {
    await inTx(async (tx) => {
      await seedBars(tx, [
        [100, 101, 99, 100],
        [100, 104, 99, 103],
        [103, 110, 101, 109],
        [109, 123, 108, 121],
      ]);
      const session = await createSession(tx, null, { name: 'L', startingBalance: '10000', riskPct: '1' });
      await placeOrder(tx, session.id, order({}));
      await advanceSession(tx, session.id, at(3));
      await placeOrder(
        tx,
        session.id,
        order({ kind: 'pending', entry: '95', sl: '90', tp: '105', at: at(3).getTime() }),
      );

      const row = (await listSessions(tx, null)).find((s) => s.id === session.id);
      expect(row).toMatchObject({ name: 'L', trades: 1, net: '100.00', openOrders: 1, instruments: ['US30'] });

      await updateSession(tx, session.id, {
        name: 'Renamed',
        startingBalance: '20000',
        riskPct: '0.75',
        costs: { US30: { spreadPoints: '1', commissionPerLot: '0', slippagePoints: '0' } },
        setupTagId: null,
        notes: 'London only',
      });
      expect(await getSessionView(tx, session.id)).toMatchObject({
        name: 'Renamed',
        startingBalance: '20000.00',
        riskPct: '0.75',
        notes: 'London only',
      });
      const [account] = await tx.select().from(accounts).where(eq(accounts.id, session.accountId));
      expect(account?.typeLabel).toBe('Backtest – Renamed');

      await setSessionStatus(tx, session.id, 'completed');
      expect((await listSessions(tx, null)).find((s) => s.id === session.id)).toMatchObject({
        status: 'completed',
        openOrders: 0,
      });
      await setSessionStatus(tx, session.id, 'in_progress');
      expect((await getSessionView(tx, session.id))?.status).toBe('in_progress');

      const closed = await sessionTrades(tx, session.id);
      expect(closed).toHaveLength(1);
      expect(closed[0]).toMatchObject({ exitReason: 'tp', ambiguous: false, netProfit: '100.00' });
      expect((await currentSession(tx, null, session.id)).id).toBe(session.id);
    });
  });
});
