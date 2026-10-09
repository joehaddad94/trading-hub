import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * DB integration tests (tech-architecture.md §8). Run against `supabase start` in CI, or a plain Postgres
 * prepared with scripts/db-plain-postgres.sh. Every test runs in a transaction that is rolled back.
 */
const url = process.env.TEST_DATABASE_URL;

const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : undefined;
afterAll(() => sql?.end());

class Rollback extends Error {}

async function inTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
  if (!sql) throw new Error('no db');
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function seedAccount(tx: postgres.TransactionSql) {
  const [firm] = await tx`select id from firms where name = 'FundedNext'`;
  const [account] = await tx`
    insert into accounts (firm_id, external_id, login, phase, is_demo, starting_balance)
    values (${firm?.id}, 999001, 999001, 'funded', false, 25000) returning id`;
  return account?.id as string;
}

async function seedTrade(tx: postgres.TransactionSql, accountId: string, source: 'live' | 'backtest', ticket: string) {
  const [trade] = await tx`
    insert into trades (account_id, source, ticket, symbol, side, lots, open_price, close_price,
                        opened_at, closed_at, profit, commission, swap)
    values (${accountId}, ${source}, ${ticket}, 'US30', 'buy', 0.21, 51392.41, 51330.8,
            '2026-10-09T13:36:19Z', '2026-10-09T13:41:02Z', -129.38, -1.5, 0.25)
    returning id, net_profit`;
  return trade as { id: string; net_profit: string };
}

async function actAs(tx: postgres.TransactionSql, role: 'anon' | 'authenticated', email?: string) {
  await tx`select set_config('request.jwt.claims', ${JSON.stringify(email ? { email } : {})}, true)`;
  await tx.unsafe(`set local role ${role}`);
}

describe.skipIf(!url)('database', () => {
  it('computes net_profit = profit + commission + swap', async () => {
    await inTx(async (tx) => {
      const trade = await seedTrade(tx, await seedAccount(tx), 'live', 'T1');
      expect(trade.net_profit).toBe('-130.63');
    });
  });

  it('refuses to delete a live trade, even as a superuser', async () => {
    await inTx(async (tx) => {
      const trade = await seedTrade(tx, await seedAccount(tx), 'live', 'T1');
      await expect(tx`delete from trades where id = ${trade.id}`).rejects.toThrow(/not allowed/);
    });
  });

  it('allows deleting a backtest trade', async () => {
    await inTx(async (tx) => {
      const trade = await seedTrade(tx, await seedAccount(tx), 'backtest', 'B1');
      const deleted = await tx`delete from trades where id = ${trade.id} returning id`;
      expect(deleted).toHaveLength(1);
    });
  });

  it('refuses to turn a live trade into a backtest trade', async () => {
    await inTx(async (tx) => {
      const trade = await seedTrade(tx, await seedAccount(tx), 'live', 'T1');
      await expect(tx`update trades set source = 'backtest' where id = ${trade.id}`).rejects.toThrow(/cannot change/);
    });
  });

  it('refuses to delete an account', async () => {
    await inTx(async (tx) => {
      const id = await seedAccount(tx);
      await expect(tx`delete from accounts where id = ${id}`).rejects.toThrow(/not allowed/);
    });
  });

  it('rejects a duplicate (account, ticket)', async () => {
    await inTx(async (tx) => {
      const accountId = await seedAccount(tx);
      await seedTrade(tx, accountId, 'live', 'T1');
      await expect(seedTrade(tx, accountId, 'live', 'T1')).rejects.toThrow(/trades_account_ticket_key/);
    });
  });

  it('RLS: the allowed email reads and writes', async () => {
    await inTx(async (tx) => {
      await seedTrade(tx, await seedAccount(tx), 'live', 'T1');
      await actAs(tx, 'authenticated', 'Owner@Example.com');
      expect(await tx`select id from trades`).toHaveLength(1);
      await tx`insert into tags (name, kind) values ('ORB', 'setup')`;
    });
  });

  it('RLS: any other signed-in user sees nothing and cannot write', async () => {
    await inTx(async (tx) => {
      await seedTrade(tx, await seedAccount(tx), 'live', 'T1');
      await actAs(tx, 'authenticated', 'someone@example.com');
      expect(await tx`select id from trades`).toHaveLength(0);
      expect(await tx`select id from accounts`).toHaveLength(0);
      await expect(tx`insert into tags (name, kind) values ('ORB', 'setup')`).rejects.toThrow(/row-level security/);
    });
  });

  it('RLS: anon has no access', async () => {
    await inTx(async (tx) => {
      await actAs(tx, 'anon');
      await expect(tx`select id from trades`).rejects.toThrow(/permission denied/);
    });
  });

  it('builds journeys from parent links', async () => {
    await inTx(async (tx) => {
      const [firm] = await tx`select id from firms where name = 'FundedNext'`;
      const [p1] = await tx`insert into accounts (firm_id, external_id, login, phase, starting_balance)
        values (${firm?.id}, 1, 1, 'p1', 25000) returning id`;
      const [p2] =
        await tx`insert into accounts (firm_id, external_id, login, phase, parent_account_id, starting_balance)
        values (${firm?.id}, 2, 2, 'p2', ${p1?.id}, 25000) returning id`;
      const rows = await tx`select root_account_id, depth from account_journeys where account_id = ${p2?.id}`;
      expect(rows[0]).toEqual({ root_account_id: p1?.id, depth: 1 });
    });
  });

  it('keeps updated_at current', async () => {
    await inTx(async (tx) => {
      const id = await seedAccount(tx);
      await tx`update accounts set updated_at = '2000-01-01' where id = ${id}`;
      const [row] = await tx`select updated_at > now() - interval '1 minute' as fresh from accounts where id = ${id}`;
      expect(row?.fresh).toBe(true);
    });
  });
});
