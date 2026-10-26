import 'server-only';
import * as Sentry from '@sentry/nextjs';
import {
  addBacktestUser,
  type BacktestUser,
  BacktestUserError,
  listBacktestUsers,
  removeBacktestUser,
} from '@trading/backtest/server';
import type { ActionResult } from '@/lib/action-result';
import { env } from '@/lib/env';
import { getDb } from '@/lib/server/db';

/** Settings › Users: who may use the Backtest Lab. */
export async function getBacktestUsers(): Promise<BacktestUser[] | null> {
  const db = getDb();
  return db ? listBacktestUsers(db) : null;
}

async function run(fn: (db: NonNullable<ReturnType<typeof getDb>>) => Promise<string>): Promise<ActionResult<string>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  try {
    return { ok: true, data: await fn(db) };
  } catch (error) {
    if (error instanceof BacktestUserError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Saving failed; it was reported.' };
  }
}

export const inviteBacktestUser = (email: string) =>
  run(async (db) => {
    await addBacktestUser(db, email, env.ALLOWED_EMAIL);
    return `${email.trim().toLowerCase()} can now sign in to the Backtest Lab.`;
  });

export const revokeBacktestUser = (email: string) =>
  run(async (db) => {
    await removeBacktestUser(db, email);
    return `${email} can no longer sign in. Their runs are kept.`;
  });
