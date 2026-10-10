import { readFileSync } from 'node:fs';
import { parseScope } from '@trading/core';
import { createDb, type Tx } from '@trading/db';
import { eq } from '@trading/db/orm';
import { accounts } from '@trading/db/schema';
import { processExportFile } from '@trading/importer/server';
import { afterAll, describe, expect, it } from 'vitest';
import { addManualCashflow, deleteManualCashflow, money, netPropResult, resolveScope } from '../src/server';

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

describe.skipIf(!url)('money', () => {
  it('shows the imported $0 discounted fee with its list price', async () => {
    await withFixture(async (tx) => {
      const m = await money(tx, null);
      expect(m.rows).toHaveLength(1);
      expect(m.rows[0]).toMatchObject({
        kind: 'challenge_fee',
        listPrice: '200',
        discount: '199.99',
        manual: false,
        account: { login: 3027687, phase: 'p1' },
      });
      expect(m.summary.net.toFixed(2)).toBe('0.00');
    });
  });

  it('adds manual payouts and fees, scopes them, and only deletes manual rows', async () => {
    await withFixture(async (tx) => {
      const [funded] = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.login, 7002880));
      if (!funded) throw new Error('no funded account');
      const payout = await addManualCashflow(tx, {
        kind: 'payout',
        amountUsd: '1500.25',
        occurredAt: new Date('2026-10-05T10:00:00Z'),
        accountId: funded.id,
        note: 'First payout',
      });
      await addManualCashflow(tx, {
        kind: 'reset_fee',
        amountUsd: '-99',
        occurredAt: new Date('2026-10-06T10:00:00Z'),
        accountId: null,
        note: null,
      });

      const all = await money(tx, null);
      expect(all.summary.payouts.toFixed(2)).toBe('1500.25');
      expect(all.summary.fees.toFixed(2)).toBe('99.00');
      expect(all.summary.net.toFixed(2)).toBe('1401.25');
      expect((await netPropResult(tx)).net.toFixed(2)).toBe('1401.25');

      const fundedOnly = await money(tx, await resolveScope(tx, parseScope('account:7002880')));
      expect(fundedOnly.rows.map((r) => r.note)).toEqual(['First payout']);
      expect(fundedOnly.firmLevel).toBe(false);

      const imported = all.rows.find((r) => !r.manual);
      expect(await deleteManualCashflow(tx, imported?.id ?? '')).toBe(false);
      expect(await deleteManualCashflow(tx, payout)).toBe(true);
      expect((await money(tx, null)).summary.net.toFixed(2)).toBe('-99.00');
    });
  });
});
