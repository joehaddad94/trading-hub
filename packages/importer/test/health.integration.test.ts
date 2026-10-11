import { readFileSync } from 'node:fs';
import { createDb } from '@trading/db';
import { sql } from '@trading/db/orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  type AlertChannel,
  checkSyncHealth,
  clearRunError,
  getSyncConditions,
  processExportFile,
  recordRunError,
  sendTestAlert,
  type Tx,
} from '../src/server';

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : undefined;
afterAll(async () => {
  await db?.$client.end();
});

const fixtureText = readFileSync(
  new URL('../../contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url),
  'utf8',
);
// Saturday 10 Oct 2026, 23:30Z: the file generated Fri 21:00Z covers the last due run.
const NOW = new Date('2026-10-10T23:30:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000);

class Rollback extends Error {}
async function inTx(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`delete from alerts_log`);
      await tx.execute(sql`delete from raw_imports`);
      await tx.execute(
        sql`update sync_health set last_file_at = null, unhealthy_since = null, last_run_error_kind = null`,
      );
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

function recordingChannel() {
  const sent: string[] = [];
  const channel: AlertChannel = { name: 'test', send: async (a) => void sent.push(a.kind) };
  return { channel, sent };
}

describe.skipIf(!url)('sync health', () => {
  it('nothing imported yet → stale', async () => {
    await inTx(async (tx) => {
      expect((await getSyncConditions(tx, NOW)).map((c) => c.kind)).toEqual(['stale']);
    });
  });

  it('a known partial file is an amber warning with no alert', async () => {
    await inTx(async (tx) => {
      await processExportFile(tx, { driveFileId: 'f1', fileName: 'a.json', content: fixtureText }, NOW);
      const { channel, sent } = recordingChannel();
      const first = await checkSyncHealth(tx, NOW, [channel]);
      expect(first.conditions.map((c) => [c.kind, c.severity])).toEqual([['file_status', 'warning']]);
      expect(first.conditions[0]?.message).toMatch(/^Latest export is partial: Phase 0 test export/);
      expect(sent).toEqual([]);
    });
  });

  it('a partial file that may have lost trades alerts once per 12 h; recovers when a good file arrives', async () => {
    await inTx(async (tx) => {
      const bad = JSON.parse(fixtureText) as Record<string, unknown>;
      bad.errors = [{ step: 'get_trading_history', account_id: 7002880, message: 'timeout' }];
      await processExportFile(tx, { driveFileId: 'f1', fileName: 'a.json', content: JSON.stringify(bad) }, NOW);
      const { channel, sent } = recordingChannel();

      const first = await checkSyncHealth(tx, NOW, [channel]);
      expect(first.conditions.map((c) => [c.kind, c.severity])).toEqual([['file_status', 'error']]);
      expect(sent).toEqual(['file_status']);

      expect((await checkSyncHealth(tx, hours(1), [channel])).notified).toEqual([]);
      expect((await checkSyncHealth(tx, hours(12), [channel])).notified).toEqual(['file_status']);

      const good = JSON.parse(fixtureText) as Record<string, unknown>;
      good.status = 'ok';
      good.errors = [];
      good.generated_at = '2026-10-10T21:20:00Z';
      await processExportFile(tx, { driveFileId: 'f2', fileName: 'b.json', content: JSON.stringify(good) }, hours(13));
      const after = await checkSyncHealth(tx, hours(13), [channel]);
      expect(after).toMatchObject({ conditions: [], recovered: true });
      expect(sent).toEqual(['file_status', 'file_status', 'recovered']);

      const [row] = await tx.execute<{ unhealthy_since: string | null; n: number }>(
        sql`select unhealthy_since, (select count(*)::int from alerts_log) as n from sync_health`,
      );
      expect(row).toEqual({ unhealthy_since: null, n: 3 });
    });
  });

  it('reports Drive access errors until cleared', async () => {
    await inTx(async (tx) => {
      await processExportFile(tx, { driveFileId: 'f1', fileName: 'a.json', content: fixtureText }, NOW);
      await recordRunError(tx, 'drive_access', 'Google Drive refused access (403)', NOW);
      const kinds = (await getSyncConditions(tx, NOW)).map((c) => c.kind);
      expect(kinds).toContain('drive_access');
      await clearRunError(tx);
      expect((await getSyncConditions(tx, NOW)).map((c) => c.kind)).not.toContain('drive_access');
    });
  });

  it('reports a rejected file and missing accounts', async () => {
    await inTx(async (tx) => {
      await processExportFile(tx, { driveFileId: 'f1', fileName: 'a.json', content: fixtureText }, NOW);
      await tx.execute(sql`update accounts set status = 'missing', status_changed_at = now() where login = 3027687`);
      const v2 = fixtureText
        .replace('"schema_version": 1', '"schema_version": 2')
        .replace('2026-10-09T21:00:00Z', '2026-10-10T21:20:00Z');
      await processExportFile(tx, { driveFileId: 'f2', fileName: 'b.json', content: v2 }, NOW);
      const conditions = await getSyncConditions(tx, NOW);
      expect(conditions.map((c) => c.kind)).toEqual(['rejected', 'account_missing']);
      expect(conditions[0]?.message).toMatch(/^Export format changed — import rejected/);
      expect(conditions[1]?.message).toBe('Account 3027687 disappeared from export.');
    });
  });

  it('logs a test alert', async () => {
    await inTx(async (tx) => {
      await sendTestAlert(tx, NOW);
      const rows = await tx.execute<{ kind: string; channel: string }>(sql`select kind, channel from alerts_log`);
      expect(rows).toEqual([{ kind: 'test', channel: 'in_app' }]);
    });
  });
});
