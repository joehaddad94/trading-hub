import { readFileSync } from 'node:fs';
import { createDb } from '@trading/db';
import { sql } from '@trading/db/orm';
import { afterAll, describe, expect, it } from 'vitest';
import { processExportFile, type Tx } from '../src/server';

/** Needs TEST_DATABASE_URL. Every test rolls back. */
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

type Event = { id: number; title: string; country: string; impact: string; timestamp: number; is_restricted?: number };

/** A news-only export, the shape the producer sends (news spec §1.2). */
function newsFile(generatedAt: string, range: { start: string; end: string }, events: Event[], status = 'ok') {
  return JSON.stringify({
    schema_version: 1,
    source: 'test',
    generated_at: generatedAt,
    mode: 'incremental',
    status,
    errors: [],
    firm_server_time_offset: '+03:00',
    news: { range, timezone: 'Etc/UTC', events },
  });
}

const unix = (iso: string) => Date.parse(iso) / 1000;
const ev = (id: number, title: string, iso: string, extra: Partial<Event> = {}): Event => ({
  id,
  title,
  country: 'USD',
  impact: 'High',
  timestamp: unix(iso),
  ...extra,
});

async function importFile(tx: Tx, name: string, content: string) {
  return processExportFile(tx, { fileName: name, driveFileId: name, content }, NOW);
}

const visible = (tx: Tx) =>
  tx.execute<{ external_id: number; title: string; event_at: string }>(sql`
    select external_id, title, to_char(event_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as event_at
    from economic_events where superseded_by is null and cancelled_at is null order by event_at, external_id`);

describe.skipIf(!url)('economic events (news N1)', () => {
  it('imports the fixture news with UTC times, and a re-import changes nothing', async () => {
    await inTx(async (tx) => {
      const first = await importFile(tx, FIXTURE_NAME, fixtureText);
      expect(first.result).not.toBe('rejected');
      const rows = await visible(tx);
      expect(rows).toHaveLength(11);
      // ISM Services PMI, timestamp 1791208800 = 5 Oct 2026 14:00 UTC.
      expect(rows.find((r) => r.external_id === 1893744)?.event_at).toBe('2026-10-05 14:00');
      const [restricted] = await tx.execute<{ n: number }>(
        sql`select count(*)::int as n from economic_events where is_restricted`,
      );

      const again = await importFile(tx, 'again.json', fixtureText);
      expect(again.result).not.toBe('rejected');
      expect(await visible(tx)).toEqual(rows);
      const [after] = await tx.execute<{ n: number; total: number }>(
        sql`select count(*) filter (where is_restricted)::int as n, count(*)::int as total from economic_events`,
      );
      expect(after).toEqual({ n: restricted?.n, total: 11 });
    });
  });

  it('hides a rescheduled duplicate and an event that vanished from the latest export', async () => {
    await inTx(async (tx) => {
      const range = { start: '2026-10-12', end: '2026-10-16' };
      await importFile(
        tx,
        'n1.json',
        newsFile('2026-10-11T21:00:00Z', range, [
          ev(1, 'CPI m/m', '2026-10-14T12:30:00Z'),
          ev(2, 'FOMC Member Speaks', '2026-10-13T15:00:00Z'),
          ev(3, 'Retail Sales m/m', '2026-10-15T12:30:00Z'),
        ]),
      );
      // Next day: the speech moved 90 minutes under a new id, retail sales was dropped.
      await importFile(
        tx,
        'n2.json',
        newsFile('2026-10-12T21:00:00Z', range, [
          ev(1, 'CPI m/m', '2026-10-14T12:30:00Z'),
          ev(4, 'FOMC Member Speaks', '2026-10-13T16:30:00Z'),
        ]),
      );
      expect((await visible(tx)).map((r) => [r.external_id, r.event_at])).toEqual([
        [4, '2026-10-13 16:30'],
        [1, '2026-10-14 12:30'],
      ]);
      const [hidden] = await tx.execute<{ superseded: number; cancelled: number }>(sql`
        select count(*) filter (where superseded_by is not null)::int as superseded,
               count(*) filter (where cancelled_at is not null)::int as cancelled
        from economic_events`);
      expect(hidden).toEqual({ superseded: 1, cancelled: 1 });

      // An older file processed late doesn't bring back what the newer one dropped or moved.
      await importFile(
        tx,
        'n1-late.json',
        newsFile('2026-10-11T21:00:00Z', range, [
          ev(1, 'CPI m/m', '2026-10-14T12:30:00Z'),
          ev(2, 'FOMC Member Speaks', '2026-10-13T15:00:00Z'),
          ev(3, 'Retail Sales m/m', '2026-10-15T12:30:00Z'),
        ]),
      );
      expect((await visible(tx)).map((r) => r.external_id)).toEqual([4, 1]);

      // A partial file never cancels anything.
      await importFile(tx, 'n3.json', newsFile('2026-10-13T21:00:00Z', range, [], 'partial'));
      expect((await visible(tx)).map((r) => r.external_id)).toEqual([4, 1]);
    });
  });

  it('takes a 12-month backfill in 92-day chunks', async () => {
    await inTx(async (tx) => {
      const start = Date.parse('2025-10-09T00:00:00Z');
      const day = 86_400_000;
      let id = 5_000_000;
      for (let chunk = 0; chunk < 4; chunk += 1) {
        const from = start + chunk * 92 * day;
        const to = Math.min(from + 91 * day, start + 364 * day);
        const events: Event[] = [];
        for (let t = from; t <= to; t += day) {
          for (const [hour, title, impact] of [
            [8, 'German Prelim CPI m/m', 'Medium'],
            [12, 'Unemployment Claims', 'High'],
            [14, 'Crude Oil Inventories', 'Low'],
          ] as const) {
            id += 1;
            events.push({ ...ev(id, title, new Date(t + hour * 3_600_000).toISOString()), impact });
          }
        }
        const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
        const result = await importFile(
          tx,
          `backfill-${chunk}.json`,
          newsFile('2026-10-09T21:00:00Z', { start: iso(from), end: iso(to) }, events),
        );
        expect(result.result).toBe('ok');
      }
      const [count] = await tx.execute<{ n: number; days: number }>(sql`
        select count(*)::int as n, count(distinct (event_at at time zone 'UTC')::date)::int as days
        from economic_events where superseded_by is null and cancelled_at is null`);
      expect(count).toEqual({ n: 365 * 3, days: 365 });
    });
  });
});
