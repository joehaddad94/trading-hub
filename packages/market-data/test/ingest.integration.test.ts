import { createDb, type Tx } from '@trading/db';
import { and, eq, sql } from '@trading/db/orm';
import { alertsLog, candles1m, dataIngestRuns, instruments } from '@trading/db/schema';
import { afterAll, describe, expect, it } from 'vitest';
import type { RawCandle } from '../src/candles';
import { isMarketOpen } from '../src/hours';
import type { MarketDataProvider } from '../src/provider';
import {
  backfill,
  candleCoverage,
  checkCandleHealth,
  ingestDay,
  latestRunsForDay,
  listInstruments,
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

/** Synthetic provider: a candle for every trading minute, minus `holes`; records calls. */
function fakeProvider(options: { holes?: [string, string][]; fail?: string[]; price?: number } = {}) {
  const calls: string[] = [];
  const provider: MarketDataProvider = {
    name: 'dukascopy',
    async fetchMinuteCandles(code, from, to) {
      calls.push(`${code}:${from.toISOString().slice(0, 10)}`);
      if (options.fail?.includes(from.toISOString().slice(0, 10))) throw new Error('HTTP 503 from datafeed');
      const rows: RawCandle[] = [];
      for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
        const iso = new Date(t).toISOString();
        if (!isMarketOpen(new Date(t))) continue;
        if (options.holes?.some(([a, b]) => iso >= a && iso < b)) continue;
        const base = options.price ?? 46000;
        rows.push({ timestamp: t, open: base, high: base + 5.25, low: base - 3.5, close: base + 1.1, volume: 0.5 });
      }
      return rows;
    },
  };
  return { provider, calls };
}

describe.skipIf(!db)('candle ingestion', () => {
  it('seeds US30 and NAS100 with their Dukascopy codes and point values', async () => {
    if (!db) return;
    const list = await listInstruments(db);
    expect(list.map((i) => [i.code, i.providerCode, i.firmSymbol, i.pointValuePerLot])).toEqual([
      ['NAS100', 'usatechidxusd', 'NDX100', '10.0000'],
      ['US30', 'usa30idxusd', 'US30', '10.0000'],
    ]);
  });

  it('ingests a day for both instruments, idempotently', async () => {
    await inTx(async (tx) => {
      const { provider } = fakeProvider();
      const first = await ingestDay(tx, provider, '2026-10-07', { now: new Date('2026-10-08T04:00:00Z') });
      expect(first.map((r) => [r.code, r.status, r.rows])).toEqual([
        ['NAS100', 'ok', 1380],
        ['US30', 'ok', 1380],
      ]);
      const again = fakeProvider({ price: 47000 });
      await ingestDay(tx, again.provider, '2026-10-07');
      const [row] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number), close: sql<string>`max(${candles1m.close})` })
        .from(candles1m);
      expect(row).toEqual({ count: 2760, close: '47001.10000' });
      const runs = await tx.select().from(dataIngestRuns);
      expect(runs).toHaveLength(4);
      const coverage = await candleCoverage(tx);
      expect(coverage.map((c) => [c.code, c.count, c.first?.toISOString()])).toEqual([
        ['NAS100', 1380, '2026-10-07T00:00:00.000Z'],
        ['US30', 1380, '2026-10-07T00:00:00.000Z'],
      ]);
    });
  });

  it('logs gaps, empty days and failures — and alerts on them once', async () => {
    await inTx(async (tx) => {
      const day = '2026-10-08';
      const gappy = fakeProvider({ holes: [['2026-10-08T14:00', '2026-10-08T14:30']] });
      const [nas] = await ingestDay(tx, gappy.provider, day, { now: new Date('2026-10-09T04:00:00Z') });
      expect(nas).toMatchObject({ status: 'gaps', gaps: [{ minutes: 30 }] });

      const broken = fakeProvider({ fail: [day] });
      const results = await ingestDay(tx, broken.provider, day, { now: new Date('2026-10-09T04:01:00Z') });
      expect(results.map((r) => [r.status, r.error])).toEqual([
        ['failed', 'HTTP 503 from datafeed'],
        ['failed', 'HTTP 503 from datafeed'],
      ]);

      const now = new Date('2026-10-09T08:00:00Z');
      const latest = await latestRunsForDay(tx, day);
      expect(latest.map((l) => l.run?.status)).toEqual(['failed', 'failed']);
      const first = await checkCandleHealth(tx, now);
      expect(first.notified).toEqual(['candles_failed', 'candles_failed']);
      const second = await checkCandleHealth(tx, new Date(now.getTime() + 3_600_000));
      expect(second.notified).toEqual([]);
      const alerts = await tx.select().from(alertsLog).where(eq(alertsLog.kind, 'candles_failed'));
      expect(alerts.map((a) => a.message).sort()).toEqual([
        'NAS100: candle import for 2026-10-08 failed: HTTP 503 from datafeed',
        'US30: candle import for 2026-10-08 failed: HTTP 503 from datafeed',
      ]);

      const empty: MarketDataProvider = { name: 'dukascopy', fetchMinuteCandles: async () => [] };
      const emptyRuns = await ingestDay(tx, empty, '2026-10-06');
      expect(emptyRuns.map((r) => r.status)).toEqual(['empty', 'empty']);
      const weekend = await ingestDay(tx, empty, '2026-10-10');
      expect(weekend.map((r) => r.status)).toEqual(['ok', 'ok']);
    });
  });

  it('alerts when the daily job never ran', async () => {
    await inTx(async (tx) => {
      const { conditions } = await checkCandleHealth(tx, new Date('2026-10-09T08:00:00Z'));
      expect(conditions.map((c) => c.kind)).toEqual(['candles_missing', 'candles_missing']);
    });
  });

  it('backfills resumably: finished days are skipped, failed ones retried', async () => {
    await inTx(async (tx) => {
      const first = fakeProvider({ fail: ['2026-10-06'] });
      const progress: number[] = [];
      await backfill(tx, first.provider, {
        from: '2026-10-04',
        to: '2026-10-07',
        codes: ['US30'],
        onProgress: (_r, done) => progress.push(done),
      });
      expect(first.calls).toEqual([
        'usa30idxusd:2026-10-04',
        'usa30idxusd:2026-10-05',
        'usa30idxusd:2026-10-06',
        'usa30idxusd:2026-10-07',
      ]);
      expect(progress).toEqual([1, 2, 3, 4]);

      const second = fakeProvider();
      await backfill(tx, second.provider, { from: '2026-10-04', to: '2026-10-07', codes: ['US30'] });
      expect(second.calls).toEqual(['usa30idxusd:2026-10-06']);

      const forced = fakeProvider();
      await backfill(tx, forced.provider, { from: '2026-10-07', to: '2026-10-07', codes: ['US30'], force: true });
      expect(forced.calls).toEqual(['usa30idxusd:2026-10-07']);

      const [us30] = await tx.select({ id: instruments.id }).from(instruments).where(eq(instruments.code, 'US30'));
      const runs = await tx
        .select({ trigger: dataIngestRuns.trigger })
        .from(dataIngestRuns)
        .where(and(eq(dataIngestRuns.instrumentId, us30?.id ?? '')));
      expect(runs.every((r) => r.trigger === 'backfill')).toBe(true);
    });
  });

  it('refuses candles that break the table constraints', async () => {
    await inTx(async (tx) => {
      const [us30] = await tx.select({ id: instruments.id }).from(instruments).where(eq(instruments.code, 'US30'));
      await expect(
        tx.execute(
          sql`insert into candles_1m (instrument_id, ts, open, high, low, close) values (${us30?.id}, '2026-10-07T10:00:30Z', 1, 2, 1, 1)`,
        ),
      ).rejects.toThrow();
    });
  });
});
