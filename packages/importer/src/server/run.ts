import { createHash } from 'node:crypto';
import { parseExportFile } from '@trading/contract';
import { and, eq, isNull, lte, or, sql } from '@trading/db/orm';
import { rawImports, syncHealth } from '@trading/db/schema';
import { planImport } from '../plan';
import { type Inbox, isExportFileName } from './inbox';
import { applyImportPlan, type Tx, type WriteSummary } from './write';

type Db = Parameters<typeof applyImportPlan>[0];

export type FileOutcome = {
  fileName: string;
  driveFileId: string;
  result: 'ok' | 'partial' | 'failed' | 'rejected' | 'already_imported' | 'skipped';
  error?: string;
  summary?: WriteSummary;
};

export type ProcessInput = { driveFileId: string; fileName: string; content: string };

/**
 * Stores the file verbatim in raw_imports, validates it, then applies it.
 * - rejected: not JSON / failed the contract — kept for reprocessing, never applied.
 * - failed: the DB write threw — retried on the next run.
 */
export async function processExportFile(db: Db, input: ProcessInput, now: Date): Promise<FileOutcome> {
  const base = { fileName: input.fileName, driveFileId: input.driveFileId };

  let json: unknown;
  try {
    json = JSON.parse(input.content);
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

  await saveRaw(db, input, meta, null, null, null);
  try {
    const plan = planImport(parsed.data);
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

/** Reads every new file in the inbox, imports it and moves it to processed/. Failed writes stay for a retry. */
export async function runInboxImport(db: Db, inbox: Inbox, now: Date): Promise<FileOutcome[]> {
  const files = await inbox.list();
  const outcomes: FileOutcome[] = [];

  for (const file of files) {
    const base = { fileName: file.name, driveFileId: file.id };
    if (!isExportFileName(file.name)) {
      outcomes.push({ ...base, result: 'skipped', error: 'Not an export file name' });
      continue;
    }
    const [existing] = await db
      .select({ result: rawImports.importResult })
      .from(rawImports)
      .where(eq(rawImports.driveFileId, file.id));
    if (existing && existing.result !== 'failed' && existing.result !== null) {
      await inbox.markProcessed(file.id);
      outcomes.push({ ...base, result: 'already_imported' });
      continue;
    }

    const content = await inbox.download(file.id);
    const outcome = await processExportFile(db, { ...base, content }, now);
    if (outcome.result !== 'failed') await inbox.markProcessed(file.id);
    outcomes.push(outcome);
  }

  await db
    .insert(syncHealth)
    .values({ id: true, lastCheckAt: now })
    .onConflictDoUpdate({ target: syncHealth.id, set: { lastCheckAt: now } });
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
