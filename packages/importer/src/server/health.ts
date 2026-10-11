import { evaluateSyncHealth, type SyncCondition, type SyncHealthInput, shouldNotify } from '@trading/core';
import { and, desc, eq, gte, sql } from '@trading/db/orm';
import { accounts, alertsLog, rawImports, syncHealth } from '@trading/db/schema';
import type { applyImportPlan } from './write';

type Db = Parameters<typeof applyImportPlan>[0];

export type Alert = { kind: string; message: string };

/** Delivery channel (tracker spec §7). v1 has only the in-app banner; email/Telegram plug in here later. */
export interface AlertChannel {
  readonly name: string;
  send(alert: Alert): Promise<void>;
}

/** In-app: the banner renders conditions from the DB, so sending only needs the alerts_log row. */
export const inAppChannel: AlertChannel = { name: 'in_app', send: async () => {} };

/** Sends through a channel and logs it. */
export async function notify(db: Db, channel: AlertChannel, alert: Alert, now: Date): Promise<void> {
  await channel.send(alert);
  await db.insert(alertsLog).values({ kind: alert.kind, message: alert.message, channel: channel.name, sentAt: now });
}

async function ensureRow(db: Db) {
  await db.insert(syncHealth).values({ id: true }).onConflictDoNothing();
}

export async function recordRunError(db: Db, kind: 'drive_access' | 'import_failed', message: string, now: Date) {
  await ensureRow(db);
  await db
    .update(syncHealth)
    .set({ lastRunErrorKind: kind, lastRunError: message, lastRunErrorAt: now })
    .where(eq(syncHealth.id, true));
}

export async function clearRunError(db: Db) {
  await ensureRow(db);
  await db
    .update(syncHealth)
    .set({ lastRunErrorKind: null, lastRunError: null, lastRunErrorAt: null })
    .where(eq(syncHealth.id, true));
}

/** Cheap reads only — runs on every page load for the banner. */
export async function readSyncHealthInput(db: Db, now: Date): Promise<SyncHealthInput> {
  const [health] = await db.select().from(syncHealth).where(eq(syncHealth.id, true));
  const [latest] = await db
    .select({
      generatedAt: rawImports.generatedAt,
      createdAt: rawImports.createdAt,
      status: rawImports.status,
      errors: rawImports.errors,
      importResult: rawImports.importResult,
      importError: rawImports.importError,
    })
    .from(rawImports)
    // A file too broken to carry generated_at is dated by its arrival, so its rejection still shows.
    .orderBy(sql`coalesce(${rawImports.generatedAt}, ${rawImports.createdAt}) desc`, desc(rawImports.createdAt))
    .limit(1);
  const missing = await db
    .select({ login: accounts.login, since: accounts.statusChangedAt })
    .from(accounts)
    .where(eq(accounts.status, 'missing'));

  const kind = health?.lastRunErrorKind;
  return {
    now,
    lastFileAt: health?.lastFileAt ?? null,
    latestImport: latest ?? null,
    lastRunError:
      (kind === 'drive_access' || kind === 'import_failed') && health?.lastRunErrorAt
        ? { kind, message: health.lastRunError ?? '', at: health.lastRunErrorAt }
        : null,
    missingAccounts: missing,
  };
}

export async function getSyncConditions(db: Db, now: Date): Promise<SyncCondition[]> {
  return evaluateSyncHealth(await readSyncHealthInput(db, now));
}

export type HealthCheckResult = { conditions: SyncCondition[]; notified: string[]; recovered: boolean };

/**
 * Evaluates §7, alerts each condition at most once per 12 h, and sends a "recovered" message when a
 * good state follows an unhealthy one. Runs in the daily import job and after page loads.
 */
export async function checkSyncHealth(
  db: Db,
  now: Date,
  channels: AlertChannel[] = [inAppChannel],
): Promise<HealthCheckResult> {
  await ensureRow(db);
  const conditions = await getSyncConditions(db, now);
  const [health] = await db
    .select({ unhealthySince: syncHealth.unhealthySince })
    .from(syncHealth)
    .where(eq(syncHealth.id, true));
  const notified: string[] = [];

  // Warnings (a known partial export) show in the app but don't alert or count as unhealthy.
  const problems = conditions.filter((c) => c.severity === 'error');
  for (const condition of problems) {
    const [last] = await db
      .select({ sentAt: alertsLog.sentAt })
      .from(alertsLog)
      .where(and(eq(alertsLog.kind, condition.kind), gte(alertsLog.sentAt, new Date(now.getTime() - 13 * 3600_000))))
      .orderBy(desc(alertsLog.sentAt))
      .limit(1);
    if (!shouldNotify(last?.sentAt ?? null, now)) continue;
    for (const channel of channels)
      await notify(db, channel, { kind: condition.kind, message: condition.message }, now);
    notified.push(condition.kind);
  }

  const recovered = problems.length === 0 && Boolean(health?.unhealthySince);
  if (recovered) {
    for (const channel of channels) {
      await notify(db, channel, { kind: 'recovered', message: 'Sync recovered: a good import arrived.' }, now);
    }
  }

  await db
    .update(syncHealth)
    .set({
      unhealthySince: problems.length === 0 ? null : (health?.unhealthySince ?? now),
      activeConditions: problems.map((c) => c.kind),
      ...(notified.length > 0 ? { lastAlertAt: now } : {}),
    })
    .where(eq(syncHealth.id, true));

  return { conditions, notified, recovered };
}

/** Settings › Imports "Send test alert". */
export async function sendTestAlert(db: Db, now: Date, channels: AlertChannel[] = [inAppChannel]): Promise<void> {
  for (const channel of channels) {
    await notify(db, channel, { kind: 'test', message: 'Test alert: the alert channel works.' }, now);
  }
}

export async function listRecentAlerts(db: Db, limit = 20) {
  return db
    .select({
      id: alertsLog.id,
      kind: alertsLog.kind,
      message: alertsLog.message,
      channel: alertsLog.channel,
      sentAt: alertsLog.sentAt,
    })
    .from(alertsLog)
    .orderBy(desc(alertsLog.sentAt))
    .limit(limit);
}
