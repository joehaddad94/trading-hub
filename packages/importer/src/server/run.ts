import { createHash } from 'node:crypto';
import { parseExportFile } from '@trading/contract';
import { and, eq, gte, isNull, lte, or, sql } from '@trading/db/orm';
import { rawImports, syncHealth } from '@trading/db/schema';
import { planImport } from '../plan';
import { type Inbox, InboxAccessError, type InboxFile, isExportFileName } from './inbox';
import { applyImportPlan, type Tx, type WriteSummary } from './write';

type Db = Parameters<typeof applyImportPlan>[0];

export type FileOutcome = {
  fileName: string;
  driveFileId: string;
  result: 'ok' | 'partial' | 'failed' | 'rejected' | 'already_imported' | 'skipped';
  error?: string;
  /** Google Drive refused this file (download or move); reported as a run error so the banner names it. */
  driveError?: { message: string; access: boolean };
  summary?: WriteSummary;
};

export type ProcessInput = { driveFileId: string; fileName: string; content: string };

/**
 * Stores the file verbatim in raw_imports, validates it, then applies it.
 * - rejected: not JSON / failed the contract / can't be planned — kept for reprocessing, never applied.
 *   These are properties of the file, so retrying the same bytes can't help.
 * - failed: the DB write threw — retried on the next run.
 */
export async function processExportFile(db: Db, input: ProcessInput, now: Date): Promise<FileOutcome> {
  const base = { fileName: input.fileName, driveFileId: input.driveFileId };

  let json: unknown;
  try {
    // A byte-order mark is invisible in Drive but makes JSON.parse throw.
    json = JSON.parse(input.content.replace(/^\uFEFF/, ''));
  } catch (error) {
    const message = `Not valid JSON: ${(error as Error).message}`;
    await saveRaw(db, input, { payload: { unparseable: input.content.slice(0, 100_000) } }, 'rejected', message, now);
    return { ...base, result: 'rejected', error: message };
  }

  const header = json as { schema_version?: unknown; generated_at?: unknown; status?: unknown; errors?: unknown };
  const meta = {
    payload: json,
    schemaVersion: typeof header.schema_version === 'number' ? header.schema_version : null,
    generatedAt:
      typeof header.generated_at === 'string' && !Number.isNaN(Date.parse(header.generated_at))
        ? new Date(header.generated_at)
        : null,
    status: typeof header.status === 'string' ? header.status : null,
    errors: header.errors ?? null,
  };

  const parsed = parseExportFile(json);
  if (!parsed.ok) {
    const message = parsed.unknownVersion
      ? `Export format changed — import rejected. ${parsed.error}`
      : `Export file failed validation — import rejected.\n${parsed.error}`;
    await saveRaw(db, input, meta, 'rejected', message, now);
    return { ...base, result: 'rejected', error: message };
  }

  let plan: ReturnType<typeof planImport>;
  try {
    plan = planImport(parsed.data);
  } catch (error) {
    const message = `Export file has a value the importer can't read — import rejected.\n${(error as Error).message}`;
    await saveRaw(db, input, meta, 'rejected', message, now);
    return { ...base, result: 'rejected', error: message };
  }

  await saveRaw(db, input, meta, null, null, null);
  try {
    const summary = await applyImportPlan(db, plan);
    const problems = [
      ...plan.rejectedAccounts.map((r) => `Account ${r.login} rejected: ${r.reason}`),
      ...(parsed.data.status !== 'ok' ? [`File status is ${parsed.data.status}`] : []),
    ];
    const result = problems.length > 0 ? 'partial' : 'ok';
    const error = [...problems, ...plan.warnings].join('\n') || null;
    await finishRaw(db, input.driveFileId, result, error, now);
    await recordHealth(db, { fileAt: meta.generatedAt, okAt: now });
    return { ...base, result, summary, ...(error ? { error } : {}) };
  } catch (error) {
    const message = `Import failed: ${(error as Error).message}`;
    await finishRaw(db, input.driveFileId, 'failed', message, now);
    await recordHealth(db, { fileAt: meta.generatedAt, failed: true });
    return { ...base, result: 'failed', error: message };
  }
}

/**
 * Reads every new file in the inbox, imports it and moves it to processed/. Failed writes stay for a retry.
 * One file Drive refuses (download or move) never blocks the files after it.
 */
export async function runInboxImport(db: Db, inbox: Inbox, now: Date): Promise<FileOutcome[]> {
  try {
    const files = await inbox.list();
    const outcomes: FileOutcome[] = [];
    for (const file of files) outcomes.push(await importInboxFile(db, inbox, file, now));
    return outcomes;
  } finally {
    // Also on failure: import-on-open throttles on this, so a broken run isn't retried on every page load.
    await db
      .insert(syncHealth)
      .values({ id: true, lastCheckAt: now })
      .onConflictDoUpdate({ target: syncHealth.id, set: { lastCheckAt: now } });
  }
}

async function importInboxFile(db: Db, inbox: Inbox, file: InboxFile, now: Date): Promise<FileOutcome> {
  const base = { fileName: file.name, driveFileId: file.id };
  if (!isExportFileName(file.name)) return { ...base, result: 'skipped', error: 'Not an export file name' };

  const [existing] = await db
    .select({ result: rawImports.importResult })
    .from(rawImports)
    .where(eq(rawImports.driveFileId, file.id));
  if (existing && existing.result !== 'failed' && existing.result !== null) {
    const moveError = await tryMove(inbox, file);
    return { ...base, result: 'already_imported', ...moveError };
  }

  let content: string;
  try {
    content = await inbox.download(file.id);
  } catch (error) {
    const driveError = asDriveError(`Couldn't download ${file.name} from Drive`, error);
    return { ...base, result: 'failed', error: driveError.message, driveError };
  }
  const outcome = await processExportFile(db, { ...base, content }, now);
  if (outcome.result === 'failed') return outcome;
  return { ...outcome, ...(await tryMove(inbox, file)) };
}

/** The import already landed; a refused move only leaves the file in the inbox (it is skipped next time). */
async function tryMove(inbox: Inbox, file: InboxFile): Promise<Pick<FileOutcome, 'driveError'>> {
  try {
    await inbox.markProcessed(file.id);
    return {};
  } catch (error) {
    return { driveError: asDriveError(`Imported ${file.name} but couldn't move it to processed/`, error) };
  }
}

function asDriveError(context: string, error: unknown): NonNullable<FileOutcome['driveError']> {
  return { message: `${context}: ${(error as Error).message}`, access: error instanceof InboxAccessError };
}

export class ReprocessError extends Error {}

/**
 * Settings › Imports "Reprocess" (tracker spec §8.3 #11): re-runs the stored copy of a file through today's
 * importer, e.g. after a fix that accepts a format it once rejected. Only files that didn't import cleanly.
 */
export async function reprocessImport(db: Db, rawImportId: string, now: Date): Promise<FileOutcome> {
  const [row] = await db
    .select({
      driveFileId: rawImports.driveFileId,
      fileName: rawImports.fileName,
      payload: rawImports.payload,
      result: rawImports.importResult,
    })
    .from(rawImports)
    .where(eq(rawImports.id, rawImportId));
  if (!row) throw new ReprocessError('Import not found.');
  if (row.result === 'ok') throw new ReprocessError('This file already imported cleanly.');
  const payload = row.payload as Record<string, unknown> | null;
  if (!payload || 'unparseable' in payload) {
    throw new ReprocessError('This file was not valid JSON, so there is nothing to reprocess. Upload a new export.');
  }
  return processExportFile(
    db,
    { driveFileId: row.driveFileId, fileName: row.fileName, content: JSON.stringify(payload) },
    now,
  );
}

/** How far back automatic retries of rejected files reach. Older ones need the Reprocess button. */
const RETRY_REJECTED_MS = 14 * 24 * 3600_000;

/**
 * Re-runs recent rejected files through the current importer. A rejection is caused by the file's format, so
 * after a deploy that accepts that format the file imports on the next sync without anyone pressing Reprocess.
 * Returns only the files that now got further than "rejected".
 */
export async function retryRejectedImports(db: Db, now: Date): Promise<FileOutcome[]> {
  const rows = await db
    .select({ id: rawImports.id })
    .from(rawImports)
    .where(
      and(
        eq(rawImports.importResult, 'rejected'),
        eq(rawImports.schemaVersion, 1),
        gte(rawImports.createdAt, new Date(now.getTime() - RETRY_REJECTED_MS)),
      ),
    );
  const outcomes: FileOutcome[] = [];
  for (const row of rows) {
    const outcome = await reprocessImport(db, row.id, now).catch((error: unknown) => {
      if (error instanceof ReprocessError) return null;
      throw error;
    });
    if (outcome && outcome.result !== 'rejected') outcomes.push(outcome);
  }
  return outcomes;
}

/** Longer than any run (the cron allows 60 s), so a run that crashed frees the lease on its own. */
const IMPORT_LEASE_MS = 5 * 60_000;

/**
 * Takes the inbox-import lease in one atomic update; false while another run holds it.
 * Import-on-open, the cron and "Sync now" can otherwise process the same file at the same time.
 */
export async function acquireImportLease(db: Db, now: Date, leaseMs = IMPORT_LEASE_MS): Promise<boolean> {
  await db.insert(syncHealth).values({ id: true }).onConflictDoNothing();
  const taken = await db
    .update(syncHealth)
    .set({ importLockedUntil: new Date(now.getTime() + leaseMs) })
    .where(
      and(eq(syncHealth.id, true), or(isNull(syncHealth.importLockedUntil), lte(syncHealth.importLockedUntil, now))),
    )
    .returning({ id: syncHealth.id });
  return taken.length > 0;
}

export async function releaseImportLease(db: Db): Promise<void> {
  await db.update(syncHealth).set({ importLockedUntil: null }).where(eq(syncHealth.id, true));
}

/** Manual fallback (Settings › Imports): same pipeline, keyed by content hash so a re-upload is a no-op. */
export async function importUploadedFile(db: Db, fileName: string, content: string, now: Date): Promise<FileOutcome> {
  const driveFileId = `upload:${createHash('sha256').update(content).digest('hex')}`;
  const [existing] = await db
    .select({ result: rawImports.importResult })
    .from(rawImports)
    .where(eq(rawImports.driveFileId, driveFileId));
  if (existing && existing.result !== 'failed' && existing.result !== null) {
    return { fileName, driveFileId, result: 'already_imported' };
  }
  return processExportFile(db, { driveFileId, fileName, content }, now);
}

type RawMeta = {
  payload: unknown;
  schemaVersion?: number | null;
  generatedAt?: Date | null;
  status?: string | null;
  errors?: unknown;
};

async function saveRaw(
  db: Db | Tx,
  input: ProcessInput,
  meta: RawMeta,
  result: 'rejected' | null,
  error: string | null,
  importedAt: Date | null,
) {
  const values = {
    fileName: input.fileName,
    payload: meta.payload,
    schemaVersion: meta.schemaVersion ?? null,
    generatedAt: meta.generatedAt ?? null,
    status: meta.status ?? null,
    errors: meta.errors ?? null,
    importResult: result,
    importError: error,
    importedAt,
  };
  await db
    .insert(rawImports)
    .values({ driveFileId: input.driveFileId, ...values })
    .onConflictDoUpdate({ target: rawImports.driveFileId, set: values });
}

async function finishRaw(
  db: Db,
  driveFileId: string,
  result: 'ok' | 'partial' | 'failed',
  error: string | null,
  now: Date,
) {
  await db
    .update(rawImports)
    .set({ importResult: result, importError: error, importedAt: now })
    .where(eq(rawImports.driveFileId, driveFileId));
}

async function recordHealth(db: Db, e: { fileAt: Date | null; okAt?: Date; failed?: boolean }) {
  await db.insert(syncHealth).values({ id: true }).onConflictDoNothing();
  await db
    .update(syncHealth)
    .set({
      ...(e.fileAt
        ? { lastFileAt: sql`greatest(${syncHealth.lastFileAt}, ${e.fileAt.toISOString()}::timestamptz)` }
        : {}),
      ...(e.okAt ? { lastOkImportAt: e.okAt, consecutiveFailures: 0 } : {}),
      ...(e.failed ? { consecutiveFailures: sql`${syncHealth.consecutiveFailures} + 1` } : {}),
    })
    .where(eq(syncHealth.id, true));
}
