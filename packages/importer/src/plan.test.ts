import { readFileSync } from 'node:fs';
import { type ExportFile, parseExportFile } from '@trading/contract';
import { describe, expect, it } from 'vitest';
import { planImport } from './plan';

const raw = JSON.parse(
  readFileSync(new URL('../../contract/fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url), 'utf8'),
) as unknown;

function fixture(): ExportFile {
  const result = parseExportFile(structuredClone(raw));
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

function account(plan: ReturnType<typeof planImport>, login: number) {
  const a = plan.accounts.find((x) => x.login === login);
  if (!a) throw new Error(`no account ${login}`);
  return a;
}

describe('planImport — Phase 0 fixture', () => {
  const plan = planImport(fixture());

  it('plans 3 accounts and 99 trades with no rejections', () => {
    expect(plan.accounts).toHaveLength(3);
    expect(plan.accounts.flatMap((a) => a.trades)).toHaveLength(99);
    expect(plan.rejectedAccounts).toEqual([]);
    expect(plan.firm).toBe('FundedNext');
    expect(plan.fileStatus).toBe('partial');
  });

  it('recomputes each checksum', () => {
    expect(account(plan, 7002880).checksum).toEqual({
      checked: true,
      match: true,
      tradeNet: '-1344.71',
      balanceChange: '-1344.71',
    });
    expect(account(plan, 3028722).checksum).toMatchObject({ match: true, tradeNet: '1251.91' });
    expect(account(plan, 3027687).checksum).toMatchObject({ match: true, tradeNet: '2038.51' });
  });

  it('derives phase and status', () => {
    expect(account(plan, 7002880)).toMatchObject({ phase: 'funded', isDemo: false, status: 'active' });
    expect(account(plan, 3028722)).toMatchObject({
      phase: 'p2',
      isDemo: true,
      status: 'passed',
      statusReason: 'Profit Target Reached',
      parentExternalId: 3720149,
    });
    expect(account(plan, 3027687)).toMatchObject({ phase: 'p1', status: 'passed' });
  });

  it('reads rule limits from the data', () => {
    expect(account(plan, 7002880).rules).toMatchObject({ dailyLossLimit: '5', maxLossLimit: '10', profitTarget: null });
    expect(account(plan, 3028722).rules).toBeNull();
  });

  it('converts cycle times from server time', () => {
    expect(account(plan, 7002880).cycles[0]?.startedAt?.toISOString()).toBe('2026-09-24T13:32:33.000Z');
    expect(account(plan, 3028722).cycles[0]?.endsAt).toBeNull();
  });

  it('keeps the firm status history', () => {
    const history = account(plan, 3027687).firmStatusHistory;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ status: 'passed', statusReason: 'Migrated — Profit Target Reached' });
    expect(history[0]?.changedAt.toISOString()).toBe('2026-09-16T14:08:41.000Z');
  });

  it('turns payments into negative fees', () => {
    expect(plan.cashflows).toEqual([
      expect.objectContaining({
        kind: 'challenge_fee',
        accountLogin: 3027687,
        amountUsd: '0',
        externalRef: 'fundednext:payment:24087908',
      }),
    ]);
  });
});

describe('planImport — checksum rejection', () => {
  it('rejects an account whose trades were mistyped, keeping the others', () => {
    const file = fixture();
    const trade = file.accounts.find((a) => a.login === 7002880)?.cycles[0]?.trades[0];
    if (!trade) throw new Error('fixture changed');
    trade.profit = Number(trade.profit) + 10;

    const plan = planImport(file);
    expect(plan.rejectedAccounts).toEqual([
      { login: 7002880, reason: 'Trades sum to -1334.71 but the balance changed by -1344.71' },
    ]);
    expect(account(plan, 7002880).trades).toEqual([]);
    expect(account(plan, 3027687).trades).toHaveLength(53);
  });

  it('skips the check for multi-cycle accounts and accounts without cycles', () => {
    const file = fixture();
    const [first, second] = file.accounts;
    if (!first || !second) throw new Error('fixture changed');
    first.cycles = [...first.cycles, { external_id: 1, trades: [] }];
    second.cycles = [];
    const plan = planImport(file);
    expect(account(plan, first.login).checksum).toEqual({
      checked: false,
      reason: 'multi-cycle account: balance resets per cycle',
    });
    expect(account(plan, second.login).checksum).toEqual({ checked: false, reason: 'no cycles in this file' });
    expect(plan.rejectedAccounts).toEqual([]);
  });
});

describe('planImport — cashflows and warnings', () => {
  it('classifies payment kinds', () => {
    const file = fixture();
    const base = file.cashflows.payments[0];
    if (!base) throw new Error('fixture changed');
    const kinds = ['Reset', 'Refund', 'Add-on', 'challenge purchase', 'mystery', null];
    file.cashflows.payments = kinds.map((order_type, i) => ({ ...base, id: String(i), order_type, grand_total: 50 }));
    const plan = planImport(file);
    expect(plan.cashflows.map((c) => c.kind)).toEqual([
      'reset_fee',
      'refund',
      'addon',
      'challenge_fee',
      'other',
      'other',
    ]);
    expect(plan.cashflows[0]?.amountUsd).toBe('-50');
  });

  it('warns about unverified payouts and mixed firms', () => {
    const file = fixture();
    file.cashflows.payouts = [{ id: 1 }];
    const second = file.accounts[1];
    if (!second) throw new Error('fixture changed');
    second.firm = 'OtherFirm';
    const plan = planImport(file);
    expect(plan.warnings).toEqual([
      'File mixes firms: FundedNext, OtherFirm',
      '1 payout row(s) kept raw only: payout shape not verified yet',
    ]);
  });

  it('handles a missing equity and an empty file', () => {
    const file = fixture();
    const first = file.accounts[0];
    if (!first) throw new Error('fixture changed');
    first.equity = null;
    expect(account(planImport(file), first.login).equity).toBeNull();
    expect(planImport({ ...file, accounts: [] }).firm).toBe('FundedNext');
  });
});
