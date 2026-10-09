import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { desc, eq } from '@trading/db/orm';
import { rawImports, syncHealth } from '@trading/db/schema';
import { createGoogleDriveInbox, type FileOutcome, type Inbox, runInboxImport } from '@trading/importer/server';
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

export type ImportRun = { ok: true; outcomes: FileOutcome[] } | { ok: false; error: string };

/** Reads the Drive inbox now (cron, "Sync now"). Errors go to Sentry and are returned, never thrown. */
export async function importFromInbox(now = new Date()): Promise<ImportRun> {
  const db = getDb();
  const inbox = getInbox();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  if (!inbox) return { ok: false, error: 'Google Drive inbox is not configured.' };
  try {
    return { ok: true, outcomes: await runInboxImport(db, inbox, now) };
  } catch (error) {
    Sentry.captureException(error);
    return { ok: false, error: (error as Error).message };
  }
}

/** Import-on-open (tech-architecture.md §6): at most once per 10 minutes, after the response is sent. */
export async function maybeImport(now = new Date()): Promise<void> {
  const db = getDb();
  if (!db || !getInbox()) return;
  const [row] = await db
    .select({ lastCheckAt: syncHealth.lastCheckAt })
    .from(syncHealth)
    .where(eq(syncHealth.id, true));
  if (row?.lastCheckAt && now.getTime() - row.lastCheckAt.getTime() < IMPORT_ON_OPEN_THROTTLE_MS) return;
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
