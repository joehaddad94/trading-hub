import { describe, expect, it } from 'vitest';
import { evaluateSyncHealth, type SyncHealthInput, shouldNotify } from './health';

// Saturday 10 Oct 2026 23:00Z. The newest run with 26 h elapsed is Fri 9 Oct 00:20 Beirut (Thu 8 Oct 21:20Z).
const NOW = new Date('2026-10-10T23:00:00Z');

const LATEST: NonNullable<SyncHealthInput['latestImport']> = {
  generatedAt: new Date('2026-10-09T21:20:30Z'),
  createdAt: new Date('2026-10-09T23:00:00Z'),
  status: 'ok',
  errors: [],
  importResult: 'ok',
  importError: null,
};

function input(overrides: Partial<SyncHealthInput> = {}): SyncHealthInput {
  return {
    now: NOW,
    lastFileAt: new Date('2026-10-09T21:20:30Z'),
    latestImport: LATEST,
    lastRunError: null,
    missingAccounts: [],
    ...overrides,
  };
}

const kinds = (i: SyncHealthInput) => evaluateSyncHealth(i).map((c) => c.kind);

describe('evaluateSyncHealth', () => {
  it('healthy when the last file arrived for the last due run', () => {
    expect(kinds(input())).toEqual([]);
  });

  it('a file from the previous run is still fine until 26 h after the next run', () => {
    expect(kinds(input({ lastFileAt: new Date('2026-10-08T21:20:00Z') }))).toEqual([]);
  });

  it('stale 26 h after a run with no file', () => {
    const conditions = evaluateSyncHealth(input({ lastFileAt: new Date('2026-10-07T21:20:00Z') }));
    expect(conditions).toEqual([
      {
        kind: 'stale',
        message: 'Expected sync file is missing — scheduled task may be broken or paused.',
        since: new Date('2026-10-08T21:20:00Z'),
      },
    ]);
  });

  it('the Sat → Tue gap is normal', () => {
    // Monday 12 Oct 23:00Z; last file Saturday's run (Fri 9 Oct 21:20Z).
    expect(kinds(input({ now: new Date('2026-10-12T23:00:00Z') }))).toEqual([]);
    // Wednesday 14 Oct 23:00Z (Tuesday's run due Mon 21:20Z + 26 h passed) with nothing new → stale.
    expect(kinds(input({ now: new Date('2026-10-14T23:30:00Z') }))).toEqual(['stale']);
  });

  it('stale when nothing was ever imported', () => {
    expect(kinds(input({ lastFileAt: null, latestImport: null }))).toEqual(['stale']);
  });

  it('reports partial/error files with their errors', () => {
    const [c] = evaluateSyncHealth(
      input({
        latestImport: {
          ...LATEST,
          status: 'partial',
          errors: [{ step: 'get_trading_history', message: 'timeout' }, { message: 'second' }, 'junk'],
        },
      }),
    );
    expect(c).toMatchObject({ kind: 'file_status', message: 'Latest export is partial: timeout; second' });
    expect(evaluateSyncHealth(input({ latestImport: { ...LATEST, status: 'error', errors: null } }))[0]?.message).toBe(
      'Latest export is error.',
    );
  });

  it('reports rejected, failed and checksum results', () => {
    const base = LATEST;
    expect(
      evaluateSyncHealth(
        input({
          latestImport: {
            ...base,
            importResult: 'rejected',
            importError: 'Export format changed — import rejected. Unknown schema_version: 2',
          },
        }),
      )[0]?.message,
    ).toBe('Export format changed — import rejected. Unknown schema_version: 2');
    expect(
      evaluateSyncHealth(input({ latestImport: { ...base, importResult: 'rejected', importError: null } }))[0]?.message,
    ).toBe('Export format changed — import rejected.');
    expect(kinds(input({ latestImport: { ...base, importResult: 'failed', importError: 'db down' } }))).toEqual([
      'import_failed',
    ]);
    expect(kinds(input({ latestImport: { ...base, importResult: 'failed', importError: null } }))).toEqual([
      'import_failed',
    ]);
    expect(
      evaluateSyncHealth(
        input({
          latestImport: { ...base, importResult: 'partial', importError: 'Account 7002880 rejected: x\nother' },
        }),
      ),
    ).toEqual([expect.objectContaining({ kind: 'checksum', message: 'Account 7002880 rejected: x' })]);
  });

  it('ignores the status header of a rejected file', () => {
    expect(kinds(input({ latestImport: { ...LATEST, status: 'partial', importResult: 'rejected' } }))).toEqual([
      'rejected',
    ]);
  });

  it('uses createdAt when the file had no generated_at', () => {
    const base = LATEST;
    const [c] = evaluateSyncHealth(input({ latestImport: { ...base, generatedAt: null, importResult: 'rejected' } }));
    expect(c?.since).toEqual(base.createdAt);
  });

  it('reports Drive access and run errors', () => {
    const at = new Date('2026-10-10T22:00:00Z');
    expect(evaluateSyncHealth(input({ lastRunError: { kind: 'drive_access', message: '403', at } }))).toEqual([
      { kind: 'drive_access', message: "App can't read Drive folder. 403", since: at },
    ]);
    expect(
      evaluateSyncHealth(input({ lastRunError: { kind: 'import_failed', message: 'boom', at } }))[0]?.message,
    ).toBe('Import failed: boom');
  });

  it('reports missing accounts, oldest first', () => {
    const [c] = evaluateSyncHealth(
      input({
        missingAccounts: [
          { login: 1, since: new Date('2026-10-10T00:00:00Z') },
          { login: 2, since: new Date('2026-10-09T00:00:00Z') },
          { login: 3, since: null },
        ],
      }),
    );
    expect(c).toEqual({
      kind: 'account_missing',
      message: 'Account 1, 2, 3 disappeared from export.',
      since: new Date('2026-10-09T00:00:00Z'),
    });
  });
});

describe('shouldNotify', () => {
  it('allows one alert per 12 h', () => {
    expect(shouldNotify(null, NOW)).toBe(true);
    expect(shouldNotify(new Date(NOW.getTime() - 11 * 3600_000), NOW)).toBe(false);
    expect(shouldNotify(new Date(NOW.getTime() - 12 * 3600_000), NOW)).toBe(true);
  });
});
