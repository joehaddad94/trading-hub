import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { evaluateSyncHealth } from '@trading/core';
import { desc, eq } from '@trading/db/orm';
import { rawImports, syncHealth } from '@trading/db/schema';
import {
  acquireImportLease,
  checkSyncHealth,
  clearRunError,
  createGoogleDriveInbox,
  type FileOutcome,
  type Inbox,
  InboxAccessError,
  listRecentAlerts,
  readSyncHealthInput,
  recordRunError,
  releaseImportLease,
  runInboxImport,
} from '@trading/importer/server';
import { env } from '@/lib/env';
import { getDb } from './db';

const IMPORT_ON_OPEN_THROTTLE_MS = 10 * 60_000;

export function getInbox(): Inbox | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.DRIVE_INBOX_FOLDER_ID || !env.DRIVE_PROCESSED_FOLDER_ID) return null;
  return createGoogleDriveInbox({
    serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    inboxFolderId: env.DRIVE_INBOX_FOLDER_ID,
    processedFolderId: env.DRIVE_PROCESSED_FOLDER_ID,
  });
}

/** `busy`: another import held the lease, so this run did nothing. */
export type ImportRun = { ok: true; outcomes: FileOutcome[]; busy?: true } | { ok: false; error: string };

/** Reads the Drive inbox now (cron, "Sync now"). Errors go to Sentry and are returned, never thrown. */
export async function importFromInbox(now = new Date()): Promise<ImportRun> {
  const db = getDb();
  const inbox = getInbox();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  if (!inbox) return { ok: false, error: 'Google Drive inbox is not configured.' };
  try {
    if (!(await acquireImportLease(db, now))) return { ok: true, outcomes: [], busy: true };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: (error as Error).message };
  }
  try {
    const outcomes = await runInboxImport(db, inbox, now);
    await clearRunError(db);
    return { ok: true, outcomes };
  } catch (error) {
    Sentry.captureException(error);
    const message = (error as Error).message;
    await recordRunError(db, error instanceof InboxAccessError ? 'drive_access' : 'import_failed', message, now).catch(
      (e: unknown) => Sentry.captureException(e),
    );
    return { ok: false, error: message };
  } finally {
    await releaseImportLease(db).catch((e: unknown) => Sentry.captureException(e));
    await runHealthCheck(now);
  }
}

/** Tracker spec §7 checks + alerts (anti-spam inside). Never throws. */
export async function runHealthCheck(now = new Date()) {
  const db = getDb();
  if (!db) return null;
  try {
    return await checkSyncHealth(db, now);
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}

/** Import-on-open (tech-architecture.md §6): at most once per 10 minutes, after the response is sent. */
export async function maybeImport(now = new Date()): Promise<void> {
  const db = getDb();
  if (!db) return;
  if (!getInbox()) {
    await runHealthCheck(now);
    return;
  }
  const [row] = await db
    .select({ lastCheckAt: syncHealth.lastCheckAt })
    .from(syncHealth)
    .where(eq(syncHealth.id, true));
  if (row?.lastCheckAt && now.getTime() - row.lastCheckAt.getTime() < IMPORT_ON_OPEN_THROTTLE_MS) {
    await runHealthCheck(now);
    return;
  }
  await importFromInbox(now);
}

/** Settings › Imports list: newest first. */
export async function listRecentImports(limit = 50) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: rawImports.id,
      fileName: rawImports.fileName,
      generatedAt: rawImports.generatedAt,
      status: rawImports.status,
      importResult: rawImports.importResult,
      importError: rawImports.importError,
      importedAt: rawImports.importedAt,
    })
    .from(rawImports)
    .orderBy(desc(rawImports.createdAt))
    .limit(limit);
}

/** Banner + hub status line: cheap reads, no side effects. */
export async function getSyncStatus(now = new Date()) {
  const db = getDb();
  if (!db) return null;
  const input = await readSyncHealthInput(db, now);
  return { conditions: evaluateSyncHealth(input), lastFileAt: input.lastFileAt };
}

export async function getRecentAlerts() {
  const db = getDb();
  return db ? listRecentAlerts(db) : [];
}
