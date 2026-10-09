import { readFileSync } from 'node:fs';
import { weekRange } from '@trading/core';
import { createDb } from '@trading/db';
import { sql } from '@trading/db/orm';
import { processExportFile, type Tx } from '@trading/importer/server';
import { afterAll, describe, expect, it } from 'vitest';
import {
  eventDetail,
  eventTitles,
  getNewsSettings,
  lastNewsSync,
  listEvents,
  newsHubSummary,
  occurrences,
  saveNewsSettings,
} from '../src/server';

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : undefined;
afterAll(async () => {
  await db?.$client.end();
});

const FIXTURE_NAME = 'fundednext_2026-10-09_2100Z.json';
const fixtureText = readFileSync(new URL(`../../contract/fixtures/${FIXTURE_NAME}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-10T23:05:00Z');

class Rollback extends Error {}

async function withFixture(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      await processExportFile(tx, { fileName: FIXTURE_NAME, driveFileId: 'f1', content: fixtureText }, NOW);
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const week = weekRange('2026-10-05');

describe.skipIf(!url)('news queries', () => {
  it('lists the week filtered by impact, currency and restriction', async () => {
    await withFixture(async (tx) => {
      const all = await listEvents(tx, { from: week.start, to: week.end });
      expect(all).toHaveLength(11);
      const usdRed = await listEvents(tx, {
        ...{ from: week.start, to: week.end },
        impacts: ['high'],
        currencies: ['USD'],
      });
      expect(usdRed.map((e) => e.title)).toEqual(['FOMC Meeting Minutes']);
      const restricted = await listEvents(tx, { from: week.start, to: week.end, restrictedOnly: true });
      expect(restricted.map((e) => e.currency)).toEqual(['JPY', 'USD', 'GBP', 'CAD', 'CAD']);
      expect(await lastNewsSync(tx)).toEqual(new Date('2026-10-09T21:00:00Z'));
    });
  });

  it('shows an event with its history and the trades around it', async () => {
    await withFixture(async (tx) => {
      const [fomc] = await listEvents(tx, { from: week.start, to: week.end, impacts: ['high'], currencies: ['USD'] });
      if (!fomc) throw new Error('fixture changed');
      const d = await eventDetail(tx, fomc.id, NOW);
      expect(d?.event.restrictionLabel).toBe('Restrictions');
      expect(d?.history.map((h) => h.id)).toEqual([fomc.id]);
      const [expected] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from trades where source = 'live' and (
          opened_at between '2026-10-07T17:00:00Z' and '2026-10-07T19:00:00Z'
          or closed_at between '2026-10-07T17:00:00Z' and '2026-10-07T19:00:00Z')`);
      expect(d?.history[0]?.trades).toHaveLength(expected?.n ?? -1);
      expect(await eventDetail(tx, '00000000-0000-0000-0000-000000000000', NOW)).toBeNull();
    });
  });

  it('lists event titles for the history page, searchable', async () => {
    await withFixture(async (tx) => {
      const usd = await eventTitles(tx, { currencies: ['USD'] });
      expect(usd).toHaveLength(7);
      expect(usd[0]?.title).toBe('Prelim UoM Consumer Sentiment');
      const found = await eventTitles(tx, { search: 'fomc' });
      expect(found.map((t) => t.title).sort()).toEqual(['FOMC Meeting Minutes', 'FOMC Member Waller Speaks']);
      expect(await occurrences(tx, 'FOMC Meeting Minutes', 'USD')).toHaveLength(1);
      expect(await eventTitles(tx, { search: '100%_' })).toEqual([]);
    });
  });

  it('builds the hub card and flags an active restriction window', async () => {
    await withFixture(async (tx) => {
      // 7 Oct, 17:57 UTC: three minutes before the restricted FOMC minutes.
      const at = new Date('2026-10-07T17:57:00Z');
      const hub = await newsHubSummary(tx, at);
      expect(hub.today.map((e) => e.title)).toEqual(['FOMC Meeting Minutes']);
      expect(hub.next?.title).toBe('FOMC Meeting Minutes');
      expect(hub.activeRestrictions.map((e) => e.title)).toEqual(['FOMC Meeting Minutes']);
      expect(hub.week.map((d) => d.red)).toEqual([0, 0, 1, 0, 0]);

      await saveNewsSettings(tx, { minutesBefore: 2, minutesAfter: 2, currencies: ['USD', 'CAD'] });
      expect(await getNewsSettings(tx)).toEqual({ minutesBefore: 2, minutesAfter: 2, currencies: ['USD', 'CAD'] });
      const narrower = await newsHubSummary(tx, at);
      expect(narrower.activeRestrictions).toEqual([]);
      expect(narrower.week.map((d) => d.red)).toEqual([0, 0, 1, 0, 2]);
    });
  });
});
