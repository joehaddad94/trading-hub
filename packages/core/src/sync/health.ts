import { lastExpectedRun } from './schedule';

/** Tracker spec §7 — consumer-side dead-man's switch. Pure: callers pass state and the clock. */

export type SyncConditionKind =
  | 'stale'
  | 'file_status'
  | 'rejected'
  | 'checksum'
  | 'import_failed'
  | 'drive_access'
  | 'account_missing';

export type SyncCondition = { kind: SyncConditionKind; message: string; since: Date | null };

export type SyncHealthInput = {
  now: Date;
  /** Newest generated_at among imported files (sync_health.last_file_at). */
  lastFileAt: Date | null;
  latestImport: {
    generatedAt: Date | null;
    createdAt: Date;
    status: string | null;
    errors: unknown;
    importResult: 'ok' | 'partial' | 'failed' | 'rejected' | null;
    importError: string | null;
  } | null;
  /** Last run-level error recorded by the importer (Drive refused, crash before any file). */
  lastRunError: { kind: 'drive_access' | 'import_failed'; message: string; at: Date } | null;
  missingAccounts: { login: number; since: Date | null }[];
};

/** A file counts for a run if it was generated no earlier than this before the scheduled time. */
const RUN_TOLERANCE_MS = 60 * 60_000;
const STALE_AFTER_MS = 26 * 60 * 60_000;

export function evaluateSyncHealth(input: SyncHealthInput): SyncCondition[] {
  const conditions: SyncCondition[] = [];
  const { now, latestImport } = input;

  // 1. No file 26 h after an expected run. Find the newest run whose 26 h grace has passed.
  const due = lastExpectedRun(new Date(now.getTime() - STALE_AFTER_MS));
  if (!input.lastFileAt || input.lastFileAt.getTime() < due.getTime() - RUN_TOLERANCE_MS) {
    conditions.push({
      kind: 'stale',
      message: 'Expected sync file is missing — scheduled task may be broken or paused.',
      since: due,
    });
  }

  if (latestImport) {
    const since = latestImport.generatedAt ?? latestImport.createdAt;
    // A rejected file's own header can't be trusted, so only its rejection is reported.
    const trusted = latestImport.importResult !== 'rejected';
    if (trusted && (latestImport.status === 'error' || latestImport.status === 'partial')) {
      const details = errorMessages(latestImport.errors);
      conditions.push({
        kind: 'file_status',
        message: `Latest export is ${latestImport.status}${details.length ? `: ${details.join('; ')}` : '.'}`,
        since,
      });
    }
    if (latestImport.importResult === 'rejected') {
      conditions.push({
        kind: 'rejected',
        message: firstLine(latestImport.importError) ?? 'Export format changed — import rejected.',
        since,
      });
    }
    if (latestImport.importResult === 'failed') {
      conditions.push({ kind: 'import_failed', message: latestImport.importError ?? 'Import failed.', since });
    }
    const rejectedAccounts = (latestImport.importError ?? '')
      .split('\n')
      .filter((line) => /^Account \d+ rejected/.test(line));
    if (rejectedAccounts.length > 0) {
      conditions.push({ kind: 'checksum', message: rejectedAccounts.join('; '), since });
    }
  }

  if (input.lastRunError) {
    const { kind, message, at } = input.lastRunError;
    conditions.push({
      kind,
      message: kind === 'drive_access' ? `App can't read Drive folder. ${message}` : `Import failed: ${message}`,
      since: at,
    });
  }

  if (input.missingAccounts.length > 0) {
    const logins = input.missingAccounts.map((a) => a.login);
    const since = input.missingAccounts.reduce<Date | null>(
      (min, a) => (a.since && (!min || a.since < min) ? a.since : min),
      null,
    );
    conditions.push({
      kind: 'account_missing',
      message: `Account ${logins.join(', ')} disappeared from export.`,
      since,
    });
  }

  return conditions;
}

function errorMessages(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((e) =>
    e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string'
      ? [(e as { message: string }).message]
      : [],
  );
}

function firstLine(text: string | null): string | null {
  return text?.split('\n')[0] ?? null;
}

/** Anti-spam (tracker spec §7): one alert per condition per 12 h. */
export const ALERT_COOLDOWN_MS = 12 * 60 * 60_000;

export function shouldNotify(lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= ALERT_COOLDOWN_MS;
}
