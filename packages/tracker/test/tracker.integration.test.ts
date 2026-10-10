import { readFileSync } from 'node:fs';
import { parseScope, tradeStats } from '@trading/core';
import { createDb, type Tx } from '@trading/db';
import { sql } from '@trading/db/orm';
import { processExportFile } from '@trading/importer/server';
import { afterAll, describe, expect, it } from 'vitest';
import {
  calendarDay,
  calendarMonth,
  resolveScope,
  saveDailyNote,
  scopedTrades,
  trackerHubSummary,
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

async function withFixture(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      const outcome = await processExportFile(
        tx,
        { fileName: FIXTURE_NAME, driveFileId: 'f1', content: fixtureText },
        NOW,
      );
      expect(outcome.result).toBe('partial');
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const logins = (r: { accounts: { login: number }[] }) => r.accounts.map((a) => a.login).sort();

describe.skipIf(!url)('resolveScope', () => {
  it('maps every scope kind to account ids', async () => {
    await withFixture(async (tx) => {
      expect(logins(await resolveScope(tx, parseScope(null)))).toEqual([3027687, 3028722, 7002880]);
      expect(logins(await resolveScope(tx, parseScope('demo')))).toEqual([3027687, 3028722]);
      expect(logins(await resolveScope(tx, parseScope('funded')))).toEqual([7002880]);
      expect(logins(await resolveScope(tx, parseScope('account:7002880')))).toEqual([7002880]);
      expect(logins(await resolveScope(tx, parseScope('accounts:7002880,3028722,999')))).toEqual([3028722, 7002880]);
      // Any login of a journey resolves the whole P1 → P2 chain.
      expect(logins(await resolveScope(tx, parseScope('journey:3028722')))).toEqual([3027687, 3028722]);
      expect(logins(await resolveScope(tx, parseScope('journey:7002880')))).toEqual([7002880]);
      expect((await resolveScope(tx, parseScope('account:1'))).accountIds).toEqual([]);
    });
  });

  it('flags demo + real mixes and keeps backtest separate', async () => {
    await withFixture(async (tx) => {
      const all = await resolveScope(tx, parseScope('all'));
      expect(all.mixedDemoAndReal).toBe(true);
      expect(all.mixedSizes).toBe(false);
      expect((await resolveScope(tx, parseScope('demo'))).mixedDemoAndReal).toBe(false);
      const backtest = await resolveScope(tx, parseScope('backtest'));
      expect(backtest.source).toBe('backtest');
      expect(await scopedTrades(tx, backtest)).toEqual([]);
    });
  });

  it('scoped trades feed the metrics package (FundedNext: 35.29%, PF 0.50)', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('account:7002880'));
      const stats = tradeStats(await scopedTrades(tx, scope));
      expect(stats.trades).toBe(34);
      expect(stats.winRate?.times(100).toFixed(2)).toBe('35.29');
      expect(stats.profitFactor?.toFixed(2)).toBe('0.50');
      expect((await scopedTrades(tx, await resolveScope(tx))).length).toBe(99);
    });
  });
});

describe.skipIf(!url)('trackerHubSummary', () => {
  it('summarises the current Beirut month for all live accounts', async () => {
    await withFixture(async (tx) => {
      const s = await trackerHubSummary(tx, NOW);
      // Independent check: bucket the same trades in SQL.
      const [expected] = await tx.execute<{ net: string; days: number; green: number }>(sql`
        with d as (
          select (closed_at at time zone 'Asia/Beirut')::date as day, sum(net_profit) as net
          from trades
          where source = 'live'
            and date_trunc('month', closed_at at time zone 'Asia/Beirut') = date '2026-10-01'
          group by 1
        )
        select coalesce(sum(net), 0)::text as net, count(*)::int as days, count(*) filter (where net > 0)::int as green from d
      `);
      expect(s.monthLabel).toBe('October 2026');
      expect(s.monthNet).toBe(Number(expected?.net).toFixed(2));
      expect(s.tradingDays).toBe(expected?.days);
      expect(s.greenDays).toBe(expected?.green);
      expect(s.awaitingJournal).toBe(99);
      expect(s.activeAccounts.map((a) => a.login)).toEqual([7002880]);
      expect(s.activeAccounts[0]?.balance).toBe('23655.29');
      expect(s.hasData).toBe(true);
    });
  });

  it('is empty without data', async () => {
    if (!db) throw new Error('no db');
    const s = await trackerHubSummary(db, NOW);
    expect(s).toMatchObject({ monthNet: '0.00', tradingDays: 0, awaitingJournal: 0, hasData: false });
  });
});

describe.skipIf(!url)('calendar', () => {
  it('month day totals equal the metrics package output for the same trades', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('account:7002880'));
      const { calendar, warningDays, startingBalanceTotal } = await calendarMonth(tx, scope, {
        year: 2026,
        month: 10,
        now: NOW,
      });
      const [expected] = await tx.execute<{ net: string; n: number }>(sql`
        select sum(t.net_profit)::text as net, count(*)::int as n from trades t join accounts a on a.id = t.account_id
        where a.login = 7002880 and date_trunc('month', t.closed_at at time zone 'Asia/Beirut') = date '2026-10-01'`);
      const days = calendar.weeks.flatMap((w) => w.days).filter((d) => d.stats);
      const dayTotal = days.reduce((sum, d) => sum + Math.round(Number(d.stats?.net.toFixed(2)) * 100), 0);
      expect((dayTotal / 100).toFixed(2)).toBe(Number(expected?.net).toFixed(2));
      expect(calendar.summary.trades).toBe(expected?.n);
      expect(startingBalanceTotal).toBe('25000.00');
      expect(Array.isArray(warningDays)).toBe(true);
    });
  });

  it('shows status events in the month they happened', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('journey:3027687'));
      const { statusEvents } = await calendarMonth(tx, scope, { year: 2026, month: 9, now: NOW });
      expect(statusEvents.some((e) => e.login === 3027687 && e.day === '2026-09-16')).toBe(true);
    });
  });

  it('day view lists the trades, rules per account and the daily note', async () => {
    await withFixture(async (tx) => {
      const scope = await resolveScope(tx, parseScope('account:7002880'));
      const day = await calendarDay(tx, scope, '2026-10-09');
      const [n] = await tx.execute<{ n: number }>(sql`
        select count(*)::int as n from trades t join accounts a on a.id = t.account_id
        where a.login = 7002880 and (t.closed_at at time zone 'Asia/Beirut')::date = date '2026-10-09'`);
      expect(day.trades).toHaveLength(n?.n ?? -1);
      expect(day.stats.trades).toBe(n?.n);
      expect(day.trades[0]).toMatchObject({ journaled: false, tags: [], riskSource: 'estimated' });
      expect(day.rules).toHaveLength(1);
      expect(day.rules[0]?.usage.dailyLossLimit?.toFixed(2)).toBe('1250.00');
      expect(day.rules[0]?.usage.endBalance.toFixed(2)).toBe('23655.29');
      expect(day.note).toBeNull();

      await saveDailyNote(tx, '2026-10-09', { notes: 'Chop after NY open', mood: 'calm', marketContext: null });
      await saveDailyNote(tx, '2026-10-09', { notes: 'Chop after NY open.', mood: 'calm', marketContext: 'CPI week' });
      expect((await calendarDay(tx, scope, '2026-10-09')).note).toEqual({
        notes: 'Chop after NY open.',
        mood: 'calm',
        marketContext: 'CPI week',
      });
    });
  });
});
