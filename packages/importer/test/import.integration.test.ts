import { readFileSync } from 'node:fs';
import { createDb } from '@trading/db';
import { sql } from '@trading/db/orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  acquireImportLease,
  type Inbox,
  importUploadedFile,
  processExportFile,
  releaseImportLease,
  runInboxImport,
  type Tx,
} from '../src/server';

/** Needs TEST_DATABASE_URL (local Supabase, or scripts/db-plain-postgres.sh). Every test rolls back. */
const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : undefined;
afterAll(async () => {
  await db?.$client.end();
});

const FIXTURE_NAME = 'fundednext_2026-10-09_2100Z.json';
const fixtureText = readFileSync(new URL(`../../contract/fixtures/${FIXTURE_NAME}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-10T23:05:00Z');

class Rollback extends Error {}

async function inTx(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const TABLES = [
  'accounts',
  'account_status_history',
  'cycles',
  'trades',
  'balance_snapshots',
  'rule_snapshots',
  'cashflows',
  'raw_imports',
] as const;

async function counts(tx: Tx) {
  const out = {} as Record<(typeof TABLES)[number], number>;
  for (const t of TABLES) {
    const rows = await tx.execute<{ n: number }>(sql.raw(`select count(*)::int as n from ${t}`));
    out[t] = rows[0]?.n ?? -1;
  }
  return out;
}

function fakeInbox(files: { id: string; name: string; content: string }[]) {
  const moved: string[] = [];
  const inbox: Inbox = {
    list: async () =>
      files.filter((f) => !moved.includes(f.id)).map((f) => ({ id: f.id, name: f.name, createdTime: null })),
    download: async (id) => files.find((f) => f.id === id)?.content ?? '',
    markProcessed: async (id) => {
      moved.push(id);
    },
  };
  return { inbox, moved };
}

function withFixture(mutate: (file: Record<string, unknown>) => void): string {
  const file = JSON.parse(fixtureText) as Record<string, unknown>;
  mutate(file);
  return JSON.stringify(file);
}

describe.skipIf(!url)('import pipeline', () => {
  it('imports the Phase 0 fixture: 3 accounts, 99 trades, partial because the file says partial', async () => {
    await inTx(async (tx) => {
      const before = await counts(tx);
      const outcome = await processExportFile(
        tx,
        { driveFileId: 'f1', fileName: FIXTURE_NAME, content: fixtureText },
        NOW,
      );
      expect(outcome.result).toBe('partial');
      expect(outcome.error).toMatch(/File status is partial/);
      expect(outcome.summary).toMatchObject({ accounts: 3, trades: 99, cycles: 3, cashflows: 1 });
      const after = await counts(tx);
      expect(after.trades - before.trades).toBe(99);
      expect(after.accounts - before.accounts).toBe(3);

      const [net] = await tx.execute<{ login: string; net: string }>(sql`
        select a.login::text, sum(t.net_profit)::text as net from trades t join accounts a on a.id = t.account_id
        where a.login = 7002880 group by a.login`);
      expect(net?.net).toBe('-1344.71');

      const [first] = await tx.execute<{ opened_at: string }>(
        sql`select opened_at::text from trades where ticket = 'M8699065335386026'`,
      );
      expect(first?.opened_at).toBe('2026-10-09 13:46:59+00');
    });
  });

  it('is idempotent: importing the same file again changes no rows', async () => {
    await inTx(async (tx) => {
      await processExportFile(tx, { driveFileId: 'f1', fileName: FIXTURE_NAME, content: fixtureText }, NOW);
      const once = await counts(tx);
      const snapshot = await tx.execute(sql`select ticket, net_profit, opened_at from trades order by ticket`);
      await processExportFile(tx, { driveFileId: 'f1', fileName: FIXTURE_NAME, content: fixtureText }, NOW);
      expect(await counts(tx)).toEqual(once);
      expect(await tx.execute(sql`select ticket, net_profit, opened_at from trades order by ticket`)).toEqual(snapshot);
    });
  });

  it('links P2 to P1 when the producer inferred the parent', async () => {
    await inTx(async (tx) => {
      const content = withFixture((f) => {
        const accounts = f.accounts as { login: number; external_id: number; parent_external_id: number | null }[];
        const p1 = accounts.find((a) => a.login === 3027687);
        const p2 = accounts.find((a) => a.login === 3028722);
        if (p1 && p2) p2.parent_external_id = p1.external_id;
      });
      await processExportFile(tx, { driveFileId: 'f1', fileName: FIXTURE_NAME, content }, NOW);
      const [row] = await tx.execute<{ depth: number }>(sql`
        select j.depth from account_journeys j join accounts a on a.id = j.account_id where a.login = 3028722`);
      expect(row?.depth).toBe(1);
    });
  });

  it('rejects only the account whose trades do not add up', async () => {
    await inTx(async (tx) => {
      const content = withFixture((f) => {
        const accounts = f.accounts as { login: number; cycles: { trades: { profit: number }[] }[] }[];
        const t = accounts.find((a) => a.login === 7002880)?.cycles[0]?.trades[0];
        if (t) t.profit += 10;
      });
      const outcome = await processExportFile(tx, { driveFileId: 'f1', fileName: FIXTURE_NAME, content }, NOW);
      expect(outcome.result).toBe('partial');
      expect(outcome.error).toMatch(/Account 7002880 rejected/);
      expect(outcome.summary?.trades).toBe(65);
    });
  });

  it('rejects a malformed file and an unknown schema version, keeping them verbatim', async () => {
    await inTx(async (tx) => {
      const bad = await processExportFile(tx, { driveFileId: 'bad', fileName: 'x.json', content: '{nope' }, NOW);
      expect(bad).toMatchObject({ result: 'rejected' });
      const v2 = await processExportFile(
        tx,
        {
          driveFileId: 'v2',
          fileName: 'y.json',
          content: withFixture((f) => {
            f.schema_version = 2;
          }),
        },
        NOW,
      );
      expect(v2.error).toMatch(/Export format changed/);
      const rows = await tx.execute<{ drive_file_id: string; import_result: string; schema_version: number | null }>(
        sql`select drive_file_id, import_result, schema_version from raw_imports where drive_file_id in ('bad','v2') order by 1`,
      );
      expect(rows).toEqual([
        { drive_file_id: 'bad', import_result: 'rejected', schema_version: null },
        { drive_file_id: 'v2', import_result: 'rejected', schema_version: 2 },
      ]);
    });
  });

  it('records a status change and marks absent accounts missing on a complete file', async () => {
    await inTx(async (tx) => {
      await processExportFile(tx, { driveFileId: 'f1', fileName: FIXTURE_NAME, content: fixtureText }, NOW);
      const next = withFixture((f) => {
        f.generated_at = '2026-10-10T21:20:00Z';
        f.status = 'ok';
        f.mode = 'incremental';
        const accounts = f.accounts as {
          login: number;
          bucket: string;
          breached_by: string | null;
          cycles: unknown[];
        }[];
        f.accounts = accounts.filter((a) => a.login !== 3027687).map((a) => ({ ...a, cycles: [] }));
        const funded = (f.accounts as typeof accounts).find((a) => a.login === 7002880);
        if (funded) {
          funded.bucket = 'breached';
          funded.breached_by = 'Daily Loss Limit';
        }
      });
      const outcome = await processExportFile(
        tx,
        { driveFileId: 'f2', fileName: 'fundednext_2026-10-10_2120Z.json', content: next },
        NOW,
      );
      expect(outcome.summary?.markedMissing).toEqual([3027687]);
      expect(outcome.summary?.statusChanges).toBe(1);

      const statuses = await tx.execute<{ login: string; status: string }>(
        sql`select login::text, status from accounts where login in (7002880, 3027687) order by login`,
      );
      expect(statuses).toEqual([
        { login: '3027687', status: 'missing' },
        { login: '7002880', status: 'breached' },
      ]);
      // An incremental file with cycles: [] does not clear trades.
      const [n] = await tx.execute<{ n: number }>(sql`select count(*)::int as n from trades`);
      expect(n?.n).toBeGreaterThanOrEqual(99);
    });
  });

  it('does not roll an account back when an older file is reprocessed', async () => {
    await inTx(async (tx) => {
      const newer = withFixture((f) => {
        f.generated_at = '2026-10-11T21:20:00Z';
        const funded = (f.accounts as { login: number; bucket: string; breached_by: string | null }[]).find(
          (a) => a.login === 7002880,
        );
        if (funded) {
          funded.bucket = 'breached';
          funded.breached_by = 'Max Loss Limit';
        }
      });
      await processExportFile(tx, { driveFileId: 'new', fileName: 'n.json', content: newer }, NOW);
      await processExportFile(tx, { driveFileId: 'old', fileName: FIXTURE_NAME, content: fixtureText }, NOW);
      const [row] = await tx.execute<{ status: string }>(sql`select status from accounts where login = 7002880`);
      expect(row?.status).toBe('breached');
    });
  });

  it('inbox run: imports new files, moves them, skips foreign names and already-imported files', async () => {
    await inTx(async (tx) => {
      const { inbox, moved } = fakeInbox([
        { id: 'd1', name: FIXTURE_NAME, content: fixtureText },
        { id: 'd2', name: 'notes.txt', content: 'hello' },
      ]);
      const first = await runInboxImport(tx, inbox, NOW);
      expect(first.map((o) => o.result)).toEqual(['partial', 'skipped']);
      expect(moved).toEqual(['d1']);

      const again = fakeInbox([{ id: 'd1', name: FIXTURE_NAME, content: fixtureText }]);
      expect((await runInboxImport(tx, again.inbox, NOW)).map((o) => o.result)).toEqual(['already_imported']);
      expect(again.moved).toEqual(['d1']);

      const [health] = await tx.execute<{ last_check_at: string; last_file_at: string }>(
        sql`select last_check_at::text, last_file_at::text from sync_health`,
      );
      expect(health).toEqual({ last_check_at: '2026-10-10 23:05:00+00', last_file_at: '2026-10-09 21:00:00+00' });
    });
  });

  it('import lease: one run at a time, freed on release or when it expires', async () => {
    await inTx(async (tx) => {
      expect(await acquireImportLease(tx, NOW)).toBe(true);
      expect(await acquireImportLease(tx, new Date(NOW.getTime() + 60_000))).toBe(false);
      expect(await acquireImportLease(tx, new Date(NOW.getTime() + 5 * 60_000))).toBe(true);
      await releaseImportLease(tx);
      expect(await acquireImportLease(tx, NOW)).toBe(true);
    });
  });

  it('manual upload: same pipeline, re-upload is a no-op', async () => {
    await inTx(async (tx) => {
      expect((await importUploadedFile(tx, FIXTURE_NAME, fixtureText, NOW)).result).toBe('partial');
      expect((await importUploadedFile(tx, FIXTURE_NAME, fixtureText, NOW)).result).toBe('already_imported');
    });
  });
});
