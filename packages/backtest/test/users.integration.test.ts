import { createDb, type Tx } from '@trading/db';
import { afterAll, describe, expect, it } from 'vitest';
import {
  addBacktestUser,
  BacktestUserError,
  isBacktestUser,
  listBacktestUsers,
  MAX_BACKTEST_USERS,
  MAX_SIGN_IN_FAILURES,
  recordBacktestSignIn,
  recordSignInFailure,
  removeBacktestUser,
  signInThrottled,
} from '../src/server';

const url = process.env.TEST_DATABASE_URL;
const db = url ? createDb(url) : undefined;
afterAll(async () => {
  await db?.$client.end();
});

class Rollback extends Error {}

async function inTx(fn: (tx: Tx) => Promise<void>) {
  if (!db) throw new Error('no db');
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const OWNER = 'joe@example.com';

describe.skipIf(!db)('Backtest Lab users', () => {
  it('adds (case-insensitive, idempotent), lists, records sign-in and removes', async () => {
    await inTx(async (tx) => {
      await addBacktestUser(tx, ' Friend@Example.com ', OWNER);
      await addBacktestUser(tx, 'friend@example.com', OWNER);
      expect(await isBacktestUser(tx, 'FRIEND@example.com')).toBe(true);
      expect(await isBacktestUser(tx, 'stranger@example.com')).toBe(false);
      await recordBacktestSignIn(tx, 'friend@example.com', '00000000-0000-4000-8000-0000000000aa', new Date(0));
      expect(await listBacktestUsers(tx)).toEqual([
        expect.objectContaining({ email: 'friend@example.com', signedUp: true, lastSignInAt: new Date(0) }),
      ]);
      await removeBacktestUser(tx, 'Friend@example.com');
      expect(await isBacktestUser(tx, 'friend@example.com')).toBe(false);
    });
  });

  it("refuses the owner's own email and more than the cap", async () => {
    await inTx(async (tx) => {
      await expect(addBacktestUser(tx, 'JOE@example.com', OWNER)).rejects.toThrow(BacktestUserError);
      for (let i = 0; i < MAX_BACKTEST_USERS; i++) await addBacktestUser(tx, `u${i}@example.com`, OWNER);
      await expect(addBacktestUser(tx, 'one-more@example.com', OWNER)).rejects.toThrow(/limited to 10/);
    });
  });

  it('throttles an IP after too many failures in 15 minutes', async () => {
    await inTx(async (tx) => {
      const now = new Date();
      for (let i = 0; i < MAX_SIGN_IN_FAILURES - 1; i++) await recordSignInFailure(tx, '1.2.3.4', now);
      expect(await signInThrottled(tx, '1.2.3.4', now)).toBe(false);
      await recordSignInFailure(tx, '1.2.3.4', now);
      expect(await signInThrottled(tx, '1.2.3.4', now)).toBe(true);
      expect(await signInThrottled(tx, '5.6.7.8', now)).toBe(false);
      expect(await signInThrottled(tx, '1.2.3.4', new Date(now.getTime() + 16 * 60_000))).toBe(false);
    });
  });
});
