import { createDb, type Tx } from '@trading/db';
import { eq } from '@trading/db/orm';
import { candles1m, instruments } from '@trading/db/schema';
import { afterAll, describe, expect, it } from 'vitest';
import { drawingInputSchema } from '../src/drawings';
import {
  advanceSession,
  assertOwnsOrder,
  assertOwnsSession,
  assertOwnsSnapshot,
  assertOwnsTrade,
  createDrawing,
  createSession,
  currentSession,
  deleteAllDrawings,
  deleteBacktestTrade,
  deleteDrawing,
  listDrawings,
  listOrders,
  listSessions,
  placeOrder,
  TradingError,
  updateDrawing,
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

const GUEST = '00000000-0000-4000-8000-0000000000aa';
const OTHER = '00000000-0000-4000-8000-0000000000bb';
const T0 = Date.UTC(2026, 9, 7, 14, 0);

const hline = drawingInputSchema.parse({ tool: 'horizontal', points: [{ ts: T0, price: 100 }], style: {} });

describe.skipIf(!db)('Backtest Lab ownership', () => {
  it('runs are private: each owner lists, picks and creates only their own', async () => {
    await inTx(async (tx) => {
      const joe = await createSession(tx, null, { name: 'Joe run' });
      const guest = await currentSession(tx, GUEST);
      expect(guest.id).not.toBe(joe.id);
      expect(guest.name).toBe('Run 1');

      expect((await listSessions(tx, GUEST)).map((s) => s.id)).toEqual([guest.id]);
      expect((await listSessions(tx, null)).map((s) => s.id)).not.toContain(guest.id);
      expect((await listSessions(tx, OTHER)).map((s) => s.id)).toEqual([]);

      // Asking for someone else's run by id falls back to your own.
      expect((await currentSession(tx, GUEST, joe.id)).id).toBe(guest.id);
      expect((await currentSession(tx, null, guest.id)).id).not.toBe(guest.id);

      await assertOwnsSession(tx, GUEST, guest.id);
      await expect(assertOwnsSession(tx, GUEST, joe.id)).rejects.toThrow(TradingError);
      await expect(assertOwnsSession(tx, null, guest.id)).rejects.toThrow(TradingError);
      await expect(assertOwnsSession(tx, OTHER, guest.id)).rejects.toThrow(TradingError);
    });
  });

  it("orders and trades of another owner's run are refused", async () => {
    await inTx(async (tx) => {
      const [us30] = await tx.select().from(instruments).where(eq(instruments.code, 'US30'));
      await tx.insert(candles1m).values(
        [
          [100, 101, 99, 100],
          [100, 104, 99, 103],
          [103, 123, 101, 121],
        ].map(([open, high, low, close], i) => ({
          instrumentId: us30?.id as string,
          ts: new Date(T0 + i * 60_000),
          open: String(open),
          high: String(high),
          low: String(low),
          close: String(close),
          volume: '1',
        })),
      );
      const guest = await createSession(tx, GUEST, { name: 'Guest' });
      const joe = await createSession(tx, null, { name: 'Joe' });
      const placed = await placeOrder(
        tx,
        guest.id,
        placeOrderSchema.parse({
          instrument: 'US30',
          side: 'long',
          kind: 'market',
          entry: '100',
          sl: '90',
          tp: '120',
          lots: '0.5',
          at: T0,
        }),
      );
      await assertOwnsOrder(tx, GUEST, guest.id, placed.id);
      await expect(assertOwnsOrder(tx, GUEST, joe.id, placed.id)).rejects.toThrow(TradingError);
      await expect(assertOwnsOrder(tx, null, guest.id, placed.id)).rejects.toThrow(TradingError);

      await advanceSession(tx, guest.id, new Date(T0 + 2 * 60_000));
      const [closed] = await listOrders(tx, guest.id);
      const tradeId = closed?.tradeId as string;
      expect(tradeId).toBeTruthy();
      await assertOwnsTrade(tx, GUEST, tradeId);
      await expect(assertOwnsTrade(tx, null, tradeId)).rejects.toThrow(TradingError);
      await expect(assertOwnsTrade(tx, OTHER, tradeId)).rejects.toThrow(TradingError);

      const snapshot = await deleteBacktestTrade(tx, tradeId);
      await assertOwnsSnapshot(tx, GUEST, snapshot);
      await expect(assertOwnsSnapshot(tx, OTHER, snapshot)).rejects.toThrow(TradingError);
      await expect(
        assertOwnsSnapshot(tx, GUEST, {
          ...snapshot,
          orders: snapshot.orders.map((o) => ({ ...o, sessionId: joe.id })),
        }),
      ).rejects.toThrow(TradingError);
      await expect(
        assertOwnsSnapshot(tx, GUEST, { ...snapshot, tags: [{ tradeId } as (typeof snapshot.tags)[number]] }),
      ).rejects.toThrow(TradingError);
    });
  });

  it("drawings are per owner: another owner can't see, move or delete them", async () => {
    await inTx(async (tx) => {
      const mine = await createDrawing(tx, GUEST, 'US30', hline);
      const joes = await createDrawing(tx, null, 'US30', hline);
      expect((await listDrawings(tx, GUEST)).map((d) => d.id)).toEqual([mine.id]);
      expect((await listDrawings(tx, null)).map((d) => d.id)).not.toContain(mine.id);

      await expect(updateDrawing(tx, GUEST, joes.id, hline)).rejects.toThrow(/not found/);
      await deleteDrawing(tx, GUEST, joes.id);
      expect(await deleteAllDrawings(tx, GUEST, 'US30')).toBe(1);
      expect((await listDrawings(tx, null)).map((d) => d.id)).toContain(joes.id);
    });
  });
});
