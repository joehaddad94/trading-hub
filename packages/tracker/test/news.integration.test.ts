import { readFileSync } from 'node:fs';
import { parseScope } from '@trading/core';
import { createDb, type Tx } from '@trading/db';
import { and, eq } from '@trading/db/orm';
import { accounts, economicEvents, trades } from '@trading/db/schema';
import { processExportFile } from '@trading/importer/server';
import { setAccountRestriction } from '@trading/news/server';
import { afterAll, describe, expect, it } from 'vitest';
import { calendarDay, calendarMonth, newsSplit, resolveScope, tradeNews } from '../src/server';

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

describe.skipIf(!url)('news in the tracker (news N3)', () => {
  it("marks red-folder days on the calendar and lists the day's events", async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('all'));
      const month = await calendarMonth(tx, scope, { year: 2026, month: 10, now: NOW });
      // FOMC Meeting Minutes, 7 Oct 18:00 UTC = 21:00 Beirut: the only USD red folder that week.
      expect(month.newsDays).toEqual(['2026-10-07']);
      const day = await calendarDay(tx, scope, '2026-10-07');
      expect(day.events.map((e) => e.title)).toEqual(['President Trump Speaks', 'FOMC Meeting Minutes']);
    });
  });

  it('lists news around a trade, and flags the restriction window only where the rule applies', async () => {
    await withFixture(async (tx) => {
      const [t] = await tx
        .select({ id: trades.id, accountId: trades.accountId, openedAt: trades.openedAt })
        .from(trades)
        .innerJoin(accounts, eq(accounts.id, trades.accountId))
        .where(and(eq(accounts.login, 7002880), eq(trades.ticket, 'M8699065335386026')));
      if (!t) throw new Error('fixture changed');
      // Opened 13:46:59 UTC on 9 Oct; the UoM releases are at 14:00 UTC.
      const before = await tradeNews(tx, t.id);
      expect(before?.events.map((e) => [e.title, e.minutesFromOpen])).toEqual([
        ['Prelim UoM Consumer Sentiment', -13],
        ['Prelim UoM Inflation Expectations', -13],
      ]);
      expect(before?.restrictionApplies).toBe(false); // funded, but with the News Trading add-on

      await tx.insert(economicEvents).values({
        externalId: 999_001,
        title: 'Test restricted release',
        currency: 'USD',
        impact: 'high',
        eventAt: new Date(t.openedAt.getTime() + 3 * 60_000),
        isRestricted: true,
        firstSeenAt: NOW,
        lastSeenAt: NOW,
      });
      expect((await tradeNews(tx, t.id))?.inRestrictionWindow).toBe(false);
      await setAccountRestriction(tx, t.accountId, true);
      const after = await tradeNews(tx, t.id);
      expect(after?.inRestrictionWindow).toBe(true);
      expect(after?.events.find((e) => e.title === 'Test restricted release')?.inWindow).toBe(true);
      expect(await tradeNews(tx, '00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  it('splits stats into red-folder days and other days from real data', async () => {
    await withFixture(async (tx) => {
      const split = await newsSplit(tx, await resolveScope(tx, parseScope('account:7002880')));
      expect(split?.byDay.newsTrades).toBe(5);
      expect(split?.byDay.otherTrades).toBe(29);
      expect(split?.byEvent.map((e) => e.title)).toEqual(['FOMC Meeting Minutes']);
      expect(split?.near.newsTrades).toBe(0);
    });
  });
});
