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

/** `warning`: data still arrived and only a known, non-trade part is missing (e.g. next week's calendar). */
export type SyncSeverity = 'error' | 'warning';

export type SyncCondition = { kind: SyncConditionKind; message: string; since: Date | null; severity: SyncSeverity };

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
  // A file that arrived but was rejected is reported as rejected, not as missing too.
  const due = lastExpectedRun(new Date(now.getTime() - STALE_AFTER_MS));
  const cutoff = due.getTime() - RUN_TOLERANCE_MS;
  const rejectedOnTime =
    latestImport?.importResult === 'rejected' &&
    (latestImport.generatedAt ?? latestImport.createdAt).getTime() >= cutoff;
  if (!rejectedOnTime && (!input.lastFileAt || input.lastFileAt.getTime() < cutoff)) {
    conditions.push({
      kind: 'stale',
      message: 'Expected sync file is missing — scheduled task may be broken or paused.',
      since: due,
      severity: 'error',
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
        severity: latestImport.status === 'partial' && !touchesTrades(latestImport.errors) ? 'warning' : 'error',
      });
    }
    if (latestImport.importResult === 'rejected') {
      conditions.push({
        kind: 'rejected',
        message: headline(latestImport.importError) ?? 'Export format changed — import rejected.',
        since,
        severity: 'error',
      });
    }
    if (latestImport.importResult === 'failed') {
      conditions.push({
        kind: 'import_failed',
        message: latestImport.importError ?? 'Import failed.',
        since,
        severity: 'error',
      });
    }
    const rejectedAccounts = (latestImport.importError ?? '')
      .split('\n')
      .filter((line) => /^Account \d+ rejected/.test(line));
    if (rejectedAccounts.length > 0) {
      conditions.push({ kind: 'checksum', message: rejectedAccounts.join('; '), since, severity: 'error' });
    }
  }

  if (input.lastRunError) {
    const { kind, message, at } = input.lastRunError;
    conditions.push({
      kind,
      message: kind === 'drive_access' ? `App can't read Drive folder. ${message}` : `Import failed: ${message}`,
      since: at,
      severity: 'error',
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
      severity: 'error',
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

/**
 * A partial file is a real problem when a failed step could have lost trades or balances: it names an account,
 * or its step is about trades, history or accounts. Anything else (news not published yet) is a warning.
 */
function touchesTrades(errors: unknown): boolean {
  if (!Array.isArray(errors) || errors.length === 0) return true;
  return errors.some((e) => {
    if (!e || typeof e !== 'object') return true;
    const { account_id: accountId, step } = e as { account_id?: unknown; step?: unknown };
    if (accountId !== null && accountId !== undefined) return true;
    return typeof step !== 'string' || /trad|history|account|balance|cycle/i.test(step);
  });
}

/** The rejection plus its first reason, so the banner says what failed, not only that something did. */
function headline(text: string | null): string | null {
  if (!text) return null;
  const [first, ...rest] = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const reason = rest[0];
  const line = reason ? `${first} ${reason}` : (first ?? null);
  return line && line.length > 300 ? `${line.slice(0, 299)}…` : line;
}

/** Anti-spam (tracker spec §7): one alert per condition per 12 h. */
export const ALERT_COOLDOWN_MS = 12 * 60 * 60_000;

export function shouldNotify(lastSentAt: Date | null, now: Date): boolean {
  return !lastSentAt || now.getTime() - lastSentAt.getTime() >= ALERT_COOLDOWN_MS;
}
