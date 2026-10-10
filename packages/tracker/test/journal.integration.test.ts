import { readFileSync } from 'node:fs';
import { parseScope } from '@trading/core';
import { createDb, type Tx } from '@trading/db';
import { and, desc, eq } from '@trading/db/orm';
import { accounts, trades } from '@trading/db/schema';
import { processExportFile, refreshTradeRisk } from '@trading/importer/server';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addScreenshot,
  createTag,
  dailyNotesBetween,
  deleteTag,
  type JournalInput,
  journalQueue,
  listTags,
  nextUnjournaled,
  removeScreenshot,
  renameTag,
  resolveScope,
  riskQueue,
  saveDailyNote,
  saveJournal,
  setTradeRisk,
  tradeJournal,
  unjournaledCount,
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

const EMPTY: JournalInput = {
  setupTagId: null,
  followedPlan: null,
  initialSl: null,
  plannedRr: null,
  plannedRiskUsd: null,
  emotionBefore: null,
  emotionAfter: null,
  mistakes: [],
  contextTagIds: [],
  notes: null,
  rating: null,
};

async function latestTrade(tx: Tx, login: number) {
  const [row] = await tx
    .select({ trade: trades })
    .from(trades)
    .innerJoin(accounts, eq(accounts.id, trades.accountId))
    .where(and(eq(accounts.login, login), eq(trades.source, 'live')))
    .orderBy(desc(trades.closedAt))
    .limit(1);
  if (!row) throw new Error('no trade');
  return row.trade;
}

describe.skipIf(!url)('journal', () => {
  it('manages tags: create is idempotent per kind, rename, delete clears the setup', async () => {
    await withFixture(async (tx) => {
      const a = await createTag(tx, 'Test Breakout', 'setup');
      const b = await createTag(tx, 'Test Breakout', 'setup');
      expect(b.id).toBe(a.id);
      const ctx = await createTag(tx, 'Test Breakout', 'context');
      expect(ctx.id).not.toBe(a.id);
      await renameTag(tx, a.id, 'Test ORB');
      expect((await listTags(tx)).find((t) => t.id === a.id)?.name).toBe('Test ORB');

      const t = await latestTrade(tx, 7002880);
      await saveJournal(tx, t.id, { ...EMPTY, setupTagId: a.id, contextTagIds: [ctx.id] });
      await deleteTag(tx, a.id);
      await deleteTag(tx, ctx.id);
      const j = await tradeJournal(tx, t.id);
      expect(j?.entry?.setupTagId).toBeNull();
      expect(j?.contextTagIds).toEqual([]);
    });
  });

  it('saves a journal entry, replaces context tags and turns estimated risk into journal SL risk', async () => {
    await withFixture(async (tx) => {
      const t = await latestTrade(tx, 7002880);
      expect(t.riskSource).toBe('estimated');
      const before = await unjournaledCount(tx);
      const c1 = await createTag(tx, 'Test trend day', 'context');
      const c2 = await createTag(tx, 'Test CPI', 'context');
      // 20 points away from entry on the losing side of the trade.
      const sl = t.side === 'buy' ? Number(t.openPrice) - 20 : Number(t.openPrice) + 20;
      await saveJournal(tx, t.id, {
        ...EMPTY,
        followedPlan: true,
        initialSl: sl.toFixed(2),
        mistakes: ['Moved stop'],
        contextTagIds: [c1.id, c2.id],
        notes: 'Waited for the retest.',
        rating: 4,
      });
      await saveJournal(tx, t.id, {
        ...EMPTY,
        followedPlan: false,
        initialSl: sl.toFixed(2),
        mistakes: ['Moved stop', 'Early exit'],
        contextTagIds: [c2.id],
        notes: 'Waited for the retest.',
        rating: 3,
      });
      await refreshTradeRisk(tx, [t.accountId]);

      const j = await tradeJournal(tx, t.id);
      expect(j?.entry).toMatchObject({ followedPlan: false, rating: 3, mistakes: ['Moved stop', 'Early exit'] });
      expect(j?.contextTagIds).toEqual([c2.id]);
      expect(j?.trade.riskSource).toBe('journal_sl');
      // 20 points × $10/point/lot × lots.
      expect(j?.trade.riskUsd).toBe((20 * 10 * Number(t.lots)).toFixed(2));
      expect(await unjournaledCount(tx)).toBe(before - 1);
    });
  });

  it('risk queue: a tagged risk replaces the estimate without journaling the trade, and can be cleared', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('account:7002880'));
      const q = await riskQueue(tx, scope);
      expect(q.count).toBe(34);
      const first = q.trades[0];
      if (!first) throw new Error('empty queue');
      expect(first.startingBalance).toBe('25000.00');

      const accountId = await setTradeRisk(tx, first.id, { riskUsd: '250.00', riskPct: '1' });
      await refreshTradeRisk(tx, [accountId ?? '']);
      const [tagged] = await tx.select().from(trades).where(eq(trades.id, first.id));
      expect({ risk: tagged?.riskUsd, source: tagged?.riskSource }).toEqual({ risk: '250.00', source: 'journal_usd' });
      expect((await riskQueue(tx, scope)).count).toBe(33);
      expect((await journalQueue(tx, scope)).pendingCount).toBe(34);

      await setTradeRisk(tx, first.id, null);
      await refreshTradeRisk(tx, [first.accountId]);
      expect((await riskQueue(tx, scope)).count).toBe(34);
      expect(await setTradeRisk(tx, '00000000-0000-4000-8000-000000000000', null)).toBeNull();
    });
  });

  it('builds the journal queue in scope and picks the next unjournaled trade', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('account:7002880'));
      const q = await journalQueue(tx, scope);
      expect(q.pendingCount).toBe(34);
      expect(q.recent).toEqual([]);
      const [first, second] = q.pending;
      if (!first || !second) throw new Error('queue too short');
      expect(first.closedAt.getTime()).toBeGreaterThanOrEqual(second.closedAt.getTime());

      await saveJournal(tx, first.id, { ...EMPTY, rating: 5 });
      const after = await journalQueue(tx, scope);
      expect(after.pendingCount).toBe(33);
      expect(after.recent.map((r) => r.id)).toEqual([first.id]);

      const next = await nextUnjournaled(tx, { id: first.id, closedAt: first.closedAt });
      expect(next).not.toBe(first.id);
      expect(next).not.toBeNull();
    });
  });

  it('adds and removes screenshot rows and lists daily notes in a range', async () => {
    await withFixture(async (tx) => {
      const t = await latestTrade(tx, 7002880);
      const id = await addScreenshot(tx, t.id, `${t.id}/a.png`, 'Entry');
      expect((await tradeJournal(tx, t.id))?.screenshots).toHaveLength(1);
      expect(await removeScreenshot(tx, id ?? '')).toBe(`${t.id}/a.png`);
      expect((await tradeJournal(tx, t.id))?.screenshots).toHaveLength(0);

      await saveDailyNote(tx, '2026-10-01', { notes: 'Slow open', mood: 'calm', marketContext: null });
      const notes = await dailyNotesBetween(tx, '2026-10-01', '2026-10-31');
      expect(notes.find((n) => n.date === '2026-10-01')?.notes).toBe('Slow open');
      expect(await tradeJournal(tx, '00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });
});
