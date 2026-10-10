import { readFileSync } from 'node:fs';
import { createDb } from '@trading/db';
import { sql } from '@trading/db/orm';
import { afterAll, describe, expect, it } from 'vitest';
import { processExportFile, refreshTradeRisk, type Tx } from '../src/server';

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

const sources = (tx: Tx) =>
  tx.execute<{ risk_source: string; risk_usd: string; n: number }>(sql`
    select risk_source::text, risk_usd::text, count(*)::int as n from trades group by 1, 2 order by 1, 2`);

describe.skipIf(!url)('trade risk (§6)', () => {
  it('import stores an estimate (0.5% of starting balance) while SL reason codes are unverified', async () => {
    await withFixture(async (tx) => {
      expect(await sources(tx)).toEqual([{ risk_source: 'estimated', risk_usd: '125.00', n: 99 }]);
    });
  });

  it('journal entries and verified symbol specs take precedence, and only changed rows are written', async () => {
    await withFixture(async (tx) => {
      const [t] = await tx.execute<{ id: string; account_id: string; symbol: string }>(
        sql`select id, account_id, symbol from trades where ticket = 'M8699065335386026'`,
      );
      if (!t) throw new Error('fixture trade missing');
      await tx.execute(sql`insert into journal_entries (trade_id, planned_risk_usd) values (${t.id}, 80)`);
      expect(await refreshTradeRisk(tx, [t.account_id])).toBe(1);
      expect(await refreshTradeRisk(tx, [t.account_id])).toBe(0);

      // Point values were learned from the export: $10 per point per lot on both symbols.
      const specs = await tx.execute<{ symbol: string; v: string; verified: boolean }>(
        sql`select symbol, point_value_per_lot::text as v, verified from symbol_specs order by symbol`,
      );
      expect(specs).toEqual([
        { symbol: 'NDX100', v: '10.0000', verified: true },
        { symbol: 'US30', v: '10.0000', verified: true },
      ]);
      // Entry 30778, initial SL 30808 (sell), 0.25 lots, $10/point/lot → $75.00.
      await tx.execute(sql`update journal_entries set initial_sl = 30808 where trade_id = ${t.id}`);
      await refreshTradeRisk(tx, [t.account_id]);
      const [row] = await tx.execute<{ risk_usd: string; risk_source: string }>(
        sql`select risk_usd::text, risk_source::text from trades where id = ${t.id}`,
      );
      expect(row).toEqual({ risk_usd: '75.00', risk_source: 'journal_sl' });
      expect(await refreshTradeRisk(tx, [])).toBe(0);
    });
  });
});
