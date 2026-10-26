import type { Executor } from '@trading/db';
import { and, asc, eq, gt, lt, sql } from '@trading/db/orm';
import { backtestUsers, signInFailures } from '@trading/db/schema';

/** Joe's cap on invited Backtest Lab users (26 Oct 2026). */
export const MAX_BACKTEST_USERS = 10;
/** Failed email-only sign-ins allowed per IP in the window before the form refuses. */
export const MAX_SIGN_IN_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;

export class BacktestUserError extends Error {}

export type BacktestUser = { email: string; signedUp: boolean; lastSignInAt: Date | null; addedAt: Date };

const normal = (email: string) => email.trim().toLowerCase();

export async function listBacktestUsers(db: Executor): Promise<BacktestUser[]> {
  const rows = await db.select().from(backtestUsers).orderBy(asc(backtestUsers.createdAt));
  return rows.map((r) => ({
    email: r.email,
    signedUp: r.userId !== null,
    lastSignInAt: r.lastSignInAt,
    addedAt: r.createdAt,
  }));
}

/** On the list? (Signed in or not.) */
export async function isBacktestUser(db: Executor, email: string): Promise<boolean> {
  const [row] = await db
    .select({ email: backtestUsers.email })
    .from(backtestUsers)
    .where(eq(backtestUsers.email, normal(email)));
  return row !== undefined;
}

/** Adds an email; the owner's own email and an 11th user are refused. Adding one already there is a no-op. */
export async function addBacktestUser(db: Executor, email: string, ownerEmail: string): Promise<void> {
  const e = normal(email);
  if (e === normal(ownerEmail)) throw new BacktestUserError('That is your own email; you already have full access.');
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('backtest_users'))`);
    if (await isBacktestUser(tx, e)) return;
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(backtestUsers);
    if (n >= MAX_BACKTEST_USERS) {
      throw new BacktestUserError(`The Backtest Lab is limited to ${MAX_BACKTEST_USERS} people. Remove someone first.`);
    }
    await tx.insert(backtestUsers).values({ email: e });
  });
}

/**
 * Removes an email: they can't get in from their next request. Their runs stay (keyed by their auth user id),
 * so adding the same email back brings them back.
 */
export async function removeBacktestUser(db: Executor, email: string): Promise<void> {
  await db.delete(backtestUsers).where(eq(backtestUsers.email, normal(email)));
}

/** Remembers who signed in (their auth user id, for keeping runs across removal) and when. */
export async function recordBacktestSignIn(db: Executor, email: string, userId: string, at = new Date()) {
  await db
    .update(backtestUsers)
    .set({ userId, lastSignInAt: at })
    .where(eq(backtestUsers.email, normal(email)));
}

/** True while this IP has too many recent failed sign-ins. */
export async function signInThrottled(db: Executor, ip: string, now = new Date()): Promise<boolean> {
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(signInFailures)
    .where(and(eq(signInFailures.ip, ip), gt(signInFailures.at, new Date(now.getTime() - FAILURE_WINDOW_MS))));
  return n >= MAX_SIGN_IN_FAILURES;
}

/** Logs a failed sign-in and prunes day-old rows. */
export async function recordSignInFailure(db: Executor, ip: string, now = new Date()): Promise<void> {
  await db.insert(signInFailures).values({ ip, at: now });
  await db.delete(signInFailures).where(lt(signInFailures.at, new Date(now.getTime() - 86_400_000)));
}
