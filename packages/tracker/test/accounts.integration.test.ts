import { readFileSync } from 'node:fs';
import { parseScope } from '@trading/core';
import { createDb, type Tx } from '@trading/db';
import { sql } from '@trading/db/orm';
import { processExportFile } from '@trading/importer/server';
import { afterAll, describe, expect, it } from 'vitest';
import {
  accountDetail,
  getTrackerSettings,
  groupJourneys,
  listAccounts,
  overview,
  phaseComparison,
  resolveScope,
  saveTrackerSettings,
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

describe.skipIf(!url)('accounts', () => {
  it('lists every account grouped by journey, P1 before P2', async () => {
    await withFixture(async (tx) => {
      const list = await listAccounts(tx);
      expect(list).toHaveLength(3);
      const funded = list.find((a) => a.login === 7002880);
      expect(funded).toMatchObject({ phase: 'funded', status: 'active', finalBalance: '23655.29', firm: 'FundedNext' });
      expect(funded?.stats.trades).toBe(34);
      expect(funded?.stats.winRate?.times(100).toFixed(2)).toBe('35.29');
      expect(funded?.equity.at(-1)?.balance).toBe('23655.29');
      const journeys = groupJourneys(list);
      expect(journeys.map((j) => j.accounts.map((a) => a.login))).toEqual([[7002880], [3027687, 3028722]]);
    });
  });

  it('shows account detail: cycle, rules, drawdown and lifecycle', async () => {
    await withFixture(async (tx) => {
      const d = await accountDetail(tx, 7002880, NOW);
      expect(d?.rules).toMatchObject({ dailyLossPct: '5.00', maxLossPct: '10.00', lastDay: '2026-10-09' });
      expect(d?.rules?.usage.endBalance.toFixed(2)).toBe('23655.29');
      expect(d?.maxDrawdown?.amount.gt(0)).toBe(true);
      expect(d?.currentCycle?.startedAt).toBeInstanceOf(Date);
      expect(d?.timeline[0]?.label).toBe('Funded started');
      const p1 = await accountDetail(tx, 3027687, NOW);
      expect(p1?.timeline.map((e) => e.status)).toContain('passed');
      expect(await accountDetail(tx, 1, NOW)).toBeNull();
    });
  });

  it('compares demo and funded with the same metrics', async () => {
    await withFixture(async (tx) => {
      const c = await phaseComparison(tx);
      expect(c.groups.map((g) => g.key)).toEqual(['p1', 'p2', 'funded']);
      expect(c.demo.trades + c.funded.trades).toBe(99);
      expect(c.funded.trades).toBe(34);
      expect(c.deltas.length).toBeGreaterThan(0);
    });
  });

  it('overview: combined equity, boundaries and net prop result', async () => {
    await withFixture(async (tx) => {
      const o = await overview(tx, await resolveScope(tx, parseScope('all')));
      expect(o.stats.trades).toBe(99);
      expect(o.equity.at(-1)?.equity.toFixed(2)).toBe(o.stats.net.toFixed(2));
      expect(o.boundaries.length).toBeGreaterThanOrEqual(3);
      const [fees] = await tx.execute<{ s: string }>(
        sql`select coalesce(sum(amount_usd), 0)::text as s from cashflows`,
      );
      expect(o.netPropResult.net.toFixed(2)).toBe(Number(fees?.s).toFixed(2));
    });
  });

  it('saves and reads settings', async () => {
    await withFixture(async (tx) => {
      expect(await getTrackerSettings(tx)).toMatchObject({ dayPreset: 'beirut', scratchThresholdR: 0.1 });
      await saveTrackerSettings(tx, { dayPreset: 'ny17', scratchThresholdR: '0.2' });
      expect(await getTrackerSettings(tx)).toEqual({
        boundary: { timeZone: 'America/New_York', rolloverHour: 17 },
        dayPreset: 'ny17',
        scratchThresholdR: 0.2,
      });
    });
  });
});
