import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { type CandleCondition, previousUtcDay } from '@trading/market-data';
import {
  candleCoverage,
  checkCandleHealth,
  getCandleConditions,
  type IngestResult,
  ingestRecentDays,
  marketDataProvider,
} from '@trading/market-data/server';
import { env } from '@/lib/env';
import { getDb } from '@/lib/server/db';

/** `ok` is false when the job crashed or any instrument's fetch failed. */
export type CandleJobRun = { ok: boolean; day: string; results: IngestResult[]; error?: string };

/** Leave room under the route's 60 s limit to log the last run and run the health check. */
const JOB_BUDGET_MS = 45_000;

/**
 * Daily candle job (backtester spec §1.3): previous UTC day for each instrument, plus any recent day that still
 * has no good run, then the gap/alert check. Idempotent (upserts). Provider failures become `failed` runs;
 * anything not ok is reported to Sentry.
 */
export async function runCandleJob(now = new Date()): Promise<CandleJobRun> {
  const db = getDb();
  const day = previousUtcDay(now);
  if (!db) return { ok: false, day, results: [], error: 'DATABASE_URL is not configured.' };
  try {
    const provider = marketDataProvider({
      accessKeyId: env.DUKASCOPY_S3_ACCESS_KEY_ID,
      secretAccessKey: env.DUKASCOPY_S3_SECRET_ACCESS_KEY,
    });
    const results = await ingestRecentDays(db, provider, day, { now, deadline: Date.now() + JOB_BUDGET_MS });
    for (const r of results.filter((x) => x.status !== 'ok')) {
      Sentry.captureMessage(`cron/candles ${r.code} ${r.day}: ${r.status}${r.error ? ` — ${r.error}` : ''}`, 'error');
    }
    return { ok: results.every((r) => r.status !== 'failed'), day, results };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, day, results: [], error: (error as Error).message };
  } finally {
    await checkCandleHealth(db, now).catch((e: unknown) => Sentry.captureException(e));
  }
}

export type CandleStatus = {
  conditions: CandleCondition[];
  coverage: Awaited<ReturnType<typeof candleCoverage>>;
};

/** Backtest Lab: data health banner + coverage. Cheap reads, no side effects. */
export async function getCandleStatus(now = new Date()): Promise<CandleStatus | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const [conditions, coverage] = await Promise.all([getCandleConditions(db, now), candleCoverage(db)]);
    return { conditions, coverage };
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}
