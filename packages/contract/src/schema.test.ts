import { readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import { normalizeTrade } from './normalize';
import { parseExportFile } from './schema';

const fixture = JSON.parse(
  readFileSync(new URL('../fixtures/fundednext_2026-10-09_2100Z.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

function parsed() {
  const result = parseExportFile(structuredClone(fixture));
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

describe('parseExportFile — real Phase 0 export', () => {
  it('accepts the fixture: 3 accounts, 99 trades', () => {
    const data = parsed();
    expect(data.accounts).toHaveLength(3);
    const trades = data.accounts.flatMap((a) => a.cycles.flatMap((c) => c.trades));
    expect(trades).toHaveLength(99);
    expect(data.firm_server_time_offset).toBe('+03:00');
  });

  it('accepts cycle times the producer rewrote as ISO with an offset (2122Z export)', () => {
    const file = structuredClone(fixture) as { accounts: { cycles: Record<string, unknown>[] }[] };
    const cycle = file.accounts[0]?.cycles[0] as Record<string, unknown>;
    cycle.created_at = '2026-09-24T16:32:33+03:00';
    cycle.ending_at = '2026-10-14T23:45:00+03:00';
    expect(parseExportFile(file).ok).toBe(true);
  });

  it('net P/L per account matches the producer checksums', () => {
    const data = parsed();
    const byLogin = Object.fromEntries(
      data.accounts.map((a) => {
        const net = a.cycles
          .flatMap((c) => c.trades)
          .map((t) => normalizeTrade(t, data.firm_server_time_offset).netProfit)
          .reduce((sum, v) => sum.plus(v), new Decimal(0));
        return [a.login, net.toFixed(2)];
      }),
    );
    expect(byLogin).toEqual({ 7002880: '-1344.71', 3028722: '1251.91', 3027687: '2038.51' });
  });

  it('normalizes a trade from the fixture', () => {
    const data = parsed();
    const raw = data.accounts[0]?.cycles[0]?.trades[0];
    if (!raw) throw new Error('fixture changed');
    const t = normalizeTrade(raw, data.firm_server_time_offset);
    expect(t).toMatchObject({
      ticket: 'M8699065335386026',
      symbol: 'NDX100',
      side: 'sell',
      lots: '0.25',
      profit: '-26.58',
      netProfit: '-26.58',
      slFinal: null,
      firmRr: null,
      isNews: false,
    });
    expect(t.openedAt.toISOString()).toBe('2026-10-09T13:46:59.000Z');
  });

  it('accepts numeric tickets and the full live trade shape', () => {
    const data = parsed();
    const raw = {
      id: 400685324,
      ticket: 3083824,
      symbol: 'US30',
      type: 0,
      type_str: 'Buy',
      lots: '0.21',
      volume: 210,
      open_price: 51392.41,
      close_price: 51330.8,
      open_time: 1791563780,
      close_time: 1791564063,
      open_time_str: '2026-10-09 16:36:19',
      close_time_str: '2026-10-09 16:41:02',
      sl: 51332.44,
      tp: 0,
      profit: -129.38,
      commission: 0,
      swap: 0,
      pips: '-6161.000000',
      reason: 4,
      is_news: 0,
      news_trades: null,
      pnl_percentage: -0.52,
      trade_duration: '0:04:43',
      rr_ratio: '1:1.03',
    };
    const account = structuredClone(data.accounts[0]);
    if (!account) throw new Error('fixture changed');
    const file = {
      ...structuredClone(fixture),
      accounts: [{ ...account, cycles: [{ external_id: 1, trades: [raw] }] }],
    };
    const result = parseExportFile(file);
    if (!result.ok) throw new Error(result.error);
    const trade = result.data.accounts[0]?.cycles[0]?.trades[0];
    if (!trade) throw new Error('missing trade');
    const t = normalizeTrade(trade, '+03:00');
    expect(t).toMatchObject({ ticket: '3083824', side: 'buy', slFinal: '51332.44', tpFinal: null, firmRr: '1.03' });
    expect(t.reasonCode).toBe(4);
    expect(t.closedAt.toISOString()).toBe('2026-10-09T13:41:02.000Z');
  });
});

describe('parseExportFile — quoted numbers', () => {
  // The 14 Oct 2026 export quoted every account and cycle id ("external_id": "4288969") and was rejected.
  it('accepts integer ids sent as strings and converts them', () => {
    const file = structuredClone(fixture) as { accounts: Record<string, unknown>[] };
    const account = file.accounts[0] as { external_id: number; login: number; cycles: { external_id: number }[] };
    const { external_id, login } = account;
    const cycleId = account.cycles[0]?.external_id;
    Object.assign(account, { external_id: String(external_id), login: String(login) });
    if (account.cycles[0]) Object.assign(account.cycles[0], { external_id: String(cycleId) });
    const result = parseExportFile(file);
    if (!result.ok) throw new Error(result.error);
    expect(result.data.accounts[0]).toMatchObject({ external_id, login });
    expect(result.data.accounts[0]?.cycles[0]?.external_id).toBe(cycleId);
  });

  it('still rejects a string that is not a whole number', () => {
    for (const bad of ['', 'abc', '42.5', '1e3']) {
      const file = structuredClone(fixture) as { accounts: Record<string, unknown>[] };
      Object.assign(file.accounts[0] as object, { login: bad });
      expect(parseExportFile(file)).toMatchObject({ ok: false, unknownVersion: false });
    }
  });
});

describe('parseExportFile — rejects', () => {
  it('an unknown schema_version', () => {
    const result = parseExportFile({ ...fixture, schema_version: 2 });
    expect(result).toMatchObject({ ok: false, unknownVersion: true });
  });

  it('a non-object', () => {
    expect(parseExportFile(null)).toMatchObject({ ok: false, unknownVersion: true });
  });

  it('a malformed trade', () => {
    const file = structuredClone(fixture) as { accounts: { cycles: { trades: Record<string, unknown>[] }[] }[] };
    const trade = file.accounts[0]?.cycles[0]?.trades[0];
    if (!trade) throw new Error('fixture changed');
    trade.open_time_str = '09/10/2026 16:36';
    const result = parseExportFile(file);
    expect(result).toMatchObject({ ok: false, unknownVersion: false });
    if (!result.ok) expect(result.error).toMatch(/open_time_str/);
  });

  it('a bad status', () => {
    expect(parseExportFile({ ...fixture, status: 'weird' })).toMatchObject({ ok: false, unknownVersion: false });
  });
});
