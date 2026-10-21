import type { Executor } from '@trading/db';
import { and, asc, desc, eq, gte, inArray, lt, sql } from '@trading/db/orm';
import { candles1m, dataIngestRuns, instruments } from '@trading/db/schema';
import { normaliseCandles } from '../candles';
import { daysBetween, formatUtcDay, utcDayRange } from '../days';
import { findGaps, type Gap } from '../gaps';
import { type IngestStatus, ingestStatus } from '../health';
import { expectedMinutes } from '../hours';
import type { MarketDataProvider } from '../provider';

export type Instrument = typeof instruments.$inferSelect;

export type IngestResult = {
  code: string;
  day: string;
  status: IngestStatus;
  rows: number;
  gaps: Gap[];
  rejected: number;
  error: string | null;
};

/** Rows per INSERT: 7 parameters each, well under Postgres' 65k limit. */
const CHUNK = 2000;
const MAX_STORED_GAPS = 50;

export async function listInstruments(db: Executor): Promise<Instrument[]> {
  return db.select().from(instruments).orderBy(asc(instruments.code));
}

/**
 * Fetches one UTC day of 1m candles for one instrument, upserts them (idempotent on the PK), checks for gaps
 * during trading hours and logs a `data_ingest_runs` row. Never throws for a provider failure: that becomes
 * a `failed` run, which the health check alerts on.
 */
export async function ingestInstrumentDay(
  db: Executor,
  provider: MarketDataProvider,
  instrument: Instrument,
  day: string,
  options: { trigger?: string; now?: Date } = {},
): Promise<IngestResult> {
  const { from, to } = utcDayRange(day);
  let rows = 0;
  let rejected = 0;
  let error: string | null = null;
  let gaps: Gap[] = [];
  try {
    const raw = await provider.fetchMinuteCandles(instrument.providerCode, from, to);
    const batch = normaliseCandles(raw, from, to);
    rejected = batch.rejected.length;
    for (let i = 0; i < batch.candles.length; i += CHUNK) {
      const chunk = batch.candles.slice(i, i + CHUNK).map((c) => ({ instrumentId: instrument.id, ...c }));
      await db
        .insert(candles1m)
        .values(chunk)
        .onConflictDoUpdate({
          target: [candles1m.instrumentId, candles1m.ts],
          set: {
            open: sql`excluded.open`,
            high: sql`excluded.high`,
            low: sql`excluded.low`,
            close: sql`excluded.close`,
            volume: sql`excluded.volume`,
          },
        });
    }
    rows = batch.candles.length;
    const stored = await db
      .select({ ts: candles1m.ts })
      .from(candles1m)
      .where(and(eq(candles1m.instrumentId, instrument.id), gte(candles1m.ts, from), lt(candles1m.ts, to)));
    gaps = findGaps(
      from,
      to,
      stored.map((r) => r.ts),
    );
  } catch (e) {
    error = ((e as Error).message || String(e)).slice(0, 500);
  }
  const status = ingestStatus({ error, rows, expectedMinutes: expectedMinutes(from, to), gaps });
  await db.insert(dataIngestRuns).values({
    instrumentId: instrument.id,
    fromTs: from,
    toTs: to,
    rowsInserted: rows,
    status,
    error,
    gaps: gaps.length ? gaps.slice(0, MAX_STORED_GAPS) : null,
    trigger: options.trigger ?? 'cron',
    ranAt: options.now ?? new Date(),
  });
  return { code: instrument.code, day, status, rows, gaps, rejected, error };
}

/** The daily job: one UTC day for every instrument the provider serves. */
export async function ingestDay(
  db: Executor,
  provider: MarketDataProvider,
  day: string,
  options: { trigger?: string; now?: Date } = {},
): Promise<IngestResult[]> {
  const list = (await listInstruments(db)).filter((i) => i.provider === provider.name);
  const results: IngestResult[] = [];
  for (const instrument of list) results.push(await ingestInstrumentDay(db, provider, instrument, day, options));
  return results;
}

/** Days that already have a good run (ok or gaps) — the backfill skips them, which makes it resumable. */
export async function completedDays(db: Executor, instrumentId: string, from: Date, to: Date): Promise<Set<string>> {
  const runs = await db
    .select({ fromTs: dataIngestRuns.fromTs })
    .from(dataIngestRuns)
    .where(
      and(
        eq(dataIngestRuns.instrumentId, instrumentId),
        gte(dataIngestRuns.fromTs, from),
        lt(dataIngestRuns.fromTs, to),
        inArray(dataIngestRuns.status, ['ok', 'gaps']),
      ),
    );
  return new Set(runs.map((r) => r.fromTs.toISOString().slice(0, 10)));
}

export type BackfillOptions = {
  from: string;
  to: string;
  codes?: string[];
  /** Re-fetch days that already have a good run. */
  force?: boolean;
  /** Logged on each run; `backfill` unless the daily job is catching up. */
  trigger?: string;
  now?: Date;
  /** Stop starting new days after this time (epoch ms); the rest wait for the next run. */
  deadline?: number;
  onProgress?: (result: IngestResult, done: number, total: number) => void;
};

/** Spec §1.3 backfill: idempotent (upsert), resumable (skips finished days), logs each day. */
export async function backfill(db: Executor, provider: MarketDataProvider, options: BackfillOptions) {
  const days = daysBetween(options.from, options.to);
  const list = (await listInstruments(db)).filter(
    (i) => i.provider === provider.name && (!options.codes || options.codes.includes(i.code)),
  );
  const results: IngestResult[] = [];
  const total = days.length * list.length;
  let done = 0;
  const end = utcDayRange(options.to).to;
  for (const instrument of list) {
    const skip = options.force
      ? new Set<string>()
      : await completedDays(db, instrument.id, utcDayRange(options.from).from, end);
    for (const day of days) {
      done += 1;
      if (skip.has(day)) continue;
      if (options.deadline !== undefined && Date.now() > options.deadline) return results;
      const result = await ingestInstrumentDay(db, provider, instrument, day, {
        trigger: options.trigger ?? 'backfill',
        ...(options.now ? { now: options.now } : {}),
      });
      results.push(result);
      options.onProgress?.(result, done, total);
    }
  }
  return results;
}

/** How far back the daily job looks for days without a good run. */
export const CATCH_UP_DAYS = 10;

/**
 * The daily job: `day` plus any of the CATCH_UP_DAYS - 1 days before it that still have no good run (the job
 * failed, a key was fixed late, a file wasn't published in time). Days with an ok/gaps run are skipped, so a
 * normal run fetches one day per instrument and a run after an outage fills the hole by itself.
 */
export async function ingestRecentDays(
  db: Executor,
  provider: MarketDataProvider,
  day: string,
  options: { now?: Date; deadline?: number } = {},
): Promise<IngestResult[]> {
  const from = formatUtcDay(new Date(utcDayRange(day).from.getTime() - (CATCH_UP_DAYS - 1) * 86_400_000));
  return backfill(db, provider, { from, to: day, trigger: 'cron', ...options });
}

/** Latest run per instrument for one UTC day (health check, Backtest Lab status). */
export async function latestRunsForDay(db: Executor, day: string) {
  const { from } = utcDayRange(day);
  const list = await listInstruments(db);
  return Promise.all(
    list.map(async (instrument) => {
      const [run] = await db
        .select({
          status: dataIngestRuns.status,
          error: dataIngestRuns.error,
          gaps: dataIngestRuns.gaps,
          ranAt: dataIngestRuns.ranAt,
          rowsInserted: dataIngestRuns.rowsInserted,
        })
        .from(dataIngestRuns)
        .where(and(eq(dataIngestRuns.instrumentId, instrument.id), eq(dataIngestRuns.fromTs, from)))
        .orderBy(desc(dataIngestRuns.ranAt))
        .limit(1);
      return { code: instrument.code, run: run ? { ...run, gaps: (run.gaps as Gap[] | null) ?? null } : null };
    }),
  );
}

/** Coverage per instrument: first and last candle. */
export async function candleCoverage(db: Executor) {
  // First and last candle per instrument straight off the (instrument_id, ts) primary key: two index probes.
  // A count or min/max over the join reads every row (≈1.5M after two years), which took seconds in prod.
  const first = sql<Date | null>`(select c.ts from candles_1m c where c.instrument_id = ${instruments.id} order by c.ts asc limit 1)`;
  const last = sql<Date | null>`(select c.ts from candles_1m c where c.instrument_id = ${instruments.id} order by c.ts desc limit 1)`;
  return db
    .select({
      code: instruments.code,
      displayName: instruments.displayName,
      first: first.mapWith(candles1m.ts),
      last: last.mapWith(candles1m.ts),
    })
    .from(instruments)
    .orderBy(asc(instruments.code));
}
