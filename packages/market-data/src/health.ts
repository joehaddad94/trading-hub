import { previousUtcDay } from './days';
import type { Gap } from './gaps';

export type IngestStatus = 'ok' | 'gaps' | 'empty' | 'failed';

export type CandleRun = { status: IngestStatus; error: string | null; gaps: Gap[] | null; ranAt: Date };

export type CandleHealthInput = {
  now: Date;
  /** Latest run per instrument for the day being checked (null = no run yet). */
  instruments: { code: string; run: CandleRun | null }[];
};

export type CandleConditionKind = 'candles_missing' | 'candles_failed' | 'candles_empty' | 'candles_gaps';

export type CandleCondition = { kind: CandleConditionKind; message: string; since: Date | null };

/** The daily job runs at 04:00 UTC (vercel.json); give it until 06:00 before expecting yesterday's run. */
export const CANDLE_GRACE_MS = 6 * 3_600_000;

/** The UTC day whose run should exist by `now`. */
export function dayToCheck(now: Date): string {
  return previousUtcDay(new Date(now.getTime() - CANDLE_GRACE_MS));
}

/** Spec §1.3 alerts: job failed, 0 rows on an open day, unexpected gaps — plus a run that never happened. */
export function evaluateCandleHealth(input: CandleHealthInput): CandleCondition[] {
  const day = dayToCheck(input.now);
  const conditions: CandleCondition[] = [];
  for (const { code, run } of input.instruments) {
    if (!run) {
      conditions.push({ kind: 'candles_missing', message: `${code}: no candle import ran for ${day}.`, since: null });
    } else if (run.status === 'failed') {
      conditions.push({
        kind: 'candles_failed',
        message: `${code}: candle import for ${day} failed${run.error ? `: ${run.error}` : '.'}`,
        since: run.ranAt,
      });
    } else if (run.status === 'empty') {
      conditions.push({
        kind: 'candles_empty',
        message: `${code}: candle import for ${day} returned no candles on a trading day.`,
        since: run.ranAt,
      });
    } else if (run.status === 'gaps') {
      const gaps = run.gaps ?? [];
      const minutes = gaps.reduce((sum, g) => sum + g.minutes, 0);
      conditions.push({
        kind: 'candles_gaps',
        message: `${code}: ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${minutes} min) in ${day}'s candles.`,
        since: run.ranAt,
      });
    }
  }
  return conditions;
}

/** Status of a finished ingest: failures win, then emptiness on an open day, then gaps. */
export function ingestStatus(input: { error: string | null; rows: number; expectedMinutes: number; gaps: Gap[] }) {
  if (input.error) return 'failed' as const;
  if (input.rows === 0 && input.expectedMinutes > 60) return 'empty' as const;
  if (input.gaps.length > 0) return 'gaps' as const;
  return 'ok' as const;
}
