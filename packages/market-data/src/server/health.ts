import { shouldNotify } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, desc, eq, gte } from '@trading/db/orm';
import { alertsLog } from '@trading/db/schema';
import { type AlertChannel, inAppChannel, notify } from '@trading/importer/server';
import { type CandleCondition, dayToCheck, evaluateCandleHealth } from '../health';
import { latestRunsForDay } from './ingest';

export async function getCandleConditions(db: Executor, now: Date): Promise<CandleCondition[]> {
  return evaluateCandleHealth({ now, instruments: await latestRunsForDay(db, dayToCheck(now)) });
}

/**
 * Backtester spec §1.3 alerts through the tracker's channel (§7): each condition at most once per 12 h.
 * Runs after the daily candle job.
 */
export async function checkCandleHealth(
  db: Executor,
  now: Date,
  channels: AlertChannel[] = [inAppChannel],
): Promise<{ conditions: CandleCondition[]; notified: string[] }> {
  const conditions = await getCandleConditions(db, now);
  const notified: string[] = [];
  for (const condition of conditions) {
    const [last] = await db
      .select({ sentAt: alertsLog.sentAt })
      .from(alertsLog)
      .where(
        and(
          eq(alertsLog.kind, condition.kind),
          eq(alertsLog.message, condition.message),
          gte(alertsLog.sentAt, new Date(now.getTime() - 13 * 3_600_000)),
        ),
      )
      .orderBy(desc(alertsLog.sentAt))
      .limit(1);
    if (!shouldNotify(last?.sentAt ?? null, now)) continue;
    for (const channel of channels)
      await notify(db, channel, { kind: condition.kind, message: condition.message }, now);
    notified.push(condition.kind);
  }
  return { conditions, notified };
}
