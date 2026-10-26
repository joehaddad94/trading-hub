import { createDb, type Tx } from '@trading/db';
import { afterAll, describe, expect, it } from 'vitest';
import { drawingInputSchema } from '../src/drawings';
import {
  createDrawing,
  DrawingError,
  deleteAllDrawings,
  deleteDrawing,
  listDrawings,
  updateDrawing,
} from '../src/server';

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

const hline = drawingInputSchema.parse({
  tool: 'horizontal',
  points: [{ ts: 1_760_000_000_000, price: 46012.25 }],
  style: {},
});
const long = drawingInputSchema.parse({
  tool: 'long',
  points: [
    { ts: 1_760_000_000_000, price: 46000 },
    { ts: 1_760_000_900_000, price: 45980 },
    { ts: 1_760_000_900_000, price: 46040 },
  ],
  style: { sizing: { mode: 'risk_pct', value: '0.5' } },
});

describe.skipIf(!db)('drawings', () => {
  it('creates, lists per chart, moves and deletes drawings', async () => {
    await inTx(async (tx) => {
      const a = await createDrawing(tx, null, 'US30', hline);
      const b = await createDrawing(tx, null, 'NAS100', long);
      expect((await listDrawings(tx, null)).map((d) => [d.instrument, d.tool])).toEqual([
        ['US30', 'horizontal'],
        ['NAS100', 'long'],
      ]);
      await updateDrawing(tx, null, a.id, {
        ...hline,
        points: [{ ts: 1, price: 46100 }],
        style: { ...hline.style, color: '#f87171' },
      });
      const moved = (await listDrawings(tx, null)).find((d) => d.id === a.id);
      expect(moved?.points).toEqual([{ ts: 1, price: 46100 }]);
      expect(moved?.style.color).toBe('#f87171');
      await expect(updateDrawing(tx, null, a.id, { ...long })).rejects.toThrow(DrawingError);
      await deleteDrawing(tx, null, b.id);
      expect(await listDrawings(tx, null)).toHaveLength(1);
      expect(await deleteAllDrawings(tx, null, 'US30')).toBe(1);
      await expect(createDrawing(tx, null, 'XAU', hline)).rejects.toThrow('Unknown instrument XAU.');
    });
  });
});
