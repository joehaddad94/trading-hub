import { aggregate, type Bar } from '@trading/backtest-engine';
import { createDb, type Tx } from '@trading/db';
import { afterAll, describe, expect, it } from 'vitest';
import type { RawCandle } from '../src/candles';
import { isMarketOpen } from '../src/hours';
import type { MarketDataProvider } from '../src/provider';
import { ingestDay, loadBars } from '../src/server';

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

/** A walk with distinct prices per minute so aggregation mistakes show. */
const walk: MarketDataProvider = {
  name: 'dukascopy',
  async fetchMinuteCandles(_code, from, to) {
    const rows: RawCandle[] = [];
    for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
      if (!isMarketOpen(new Date(t))) continue;
      const i = (t / 60_000) % 1000;
      const open = 46000 + i / 4;
      const close = open + ((i % 7) - 3) * 0.25;
      rows.push({
        timestamp: t,
        open,
        high: Math.max(open, close) + 1.5,
        low: Math.min(open, close) - 0.75,
        close,
        volume: 1,
      });
    }
    return rows;
  },
};

describe.skipIf(!db)('loadBars', () => {
  it('never returns data after `until`; the newest 15m bar is the forming one', async () => {
    await inTx(async (tx) => {
      await ingestDay(tx, walk, '2026-10-07');
      const until = new Date('2026-10-07T14:37:00Z');
      const page = await loadBars(tx, { code: 'US30', tf: 15, until, count: 10 });
      if (!page) throw new Error('no instrument');
      expect(page.bars).toHaveLength(10);
      const last = page.bars[page.bars.length - 1] as Bar;
      expect(new Date(last.ts).toISOString()).toBe('2026-10-07T14:30:00.000Z');
      const minutes = await loadBars(tx, { code: 'US30', tf: 1, until, count: 8 });
      expect(minutes?.bars.every((b) => b.ts <= until.getTime())).toBe(true);
      expect(new Date(minutes?.bars.at(-1)?.ts ?? 0).toISOString()).toBe('2026-10-07T14:37:00.000Z');
      expect(last.close).toBe(minutes?.bars.at(-1)?.close);
      expect(last.high).toBe(Math.max(...(minutes?.bars ?? []).map((b) => b.high)));
    });
  });

  it('pages back seamlessly and matches an aggregation of the 1m data', async () => {
    await inTx(async (tx) => {
      await ingestDay(tx, walk, '2026-10-07');
      const until = new Date('2026-10-07T23:59:00Z');
      const all = await loadBars(tx, { code: 'NAS100', tf: 1, until, count: 1500 });
      const pages: Bar[][] = [];
      let before: Date | undefined;
      for (let i = 0; i < 20; i += 1) {
        const page = await loadBars(tx, { code: 'NAS100', tf: 15, until, before, count: 17 });
        if (!page || page.bars.length === 0) break;
        pages.unshift(page.bars);
        before = new Date((page.bars[0] as Bar).ts);
        if (!page.hasMore) break;
      }
      expect(pages.flat()).toEqual(aggregate(all?.bars ?? [], 15));
      expect(pages.flat()).toHaveLength(92);
    });
  });

  it('returns null for an unknown instrument', async () => {
    if (!db) return;
    expect(await loadBars(db, { code: 'XAU', tf: 1, until: new Date() })).toBeNull();
  });
});

describe.skipIf(!db)('loadBars forward', () => {
  it('pages forward from a bucket start up to `until`', async () => {
    await inTx(async (tx) => {
      await ingestDay(tx, walk, '2026-10-07');
      const until = new Date('2026-10-07T23:59:00Z');
      const all = await loadBars(tx, { code: 'US30', tf: 5, until, count: 1500 });
      const pages: Bar[][] = [];
      let after = new Date('2026-10-07T00:00:00Z');
      for (let i = 0; i < 40; i += 1) {
        const page = await loadBars(tx, { code: 'US30', tf: 5, until, after, count: 50 });
        if (!page || page.bars.length === 0) break;
        pages.push(page.bars);
        after = new Date((page.bars.at(-1) as Bar).ts + 5 * 60_000);
        if (!page.hasMore) break;
      }
      expect(pages.flat()).toEqual(all?.bars);
    });
  });
});
