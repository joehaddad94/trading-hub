import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SessionInput } from '@trading/backtest';
import {
  assertOwnsSession,
  createSession,
  deleteSession,
  getSessionView,
  listSessions,
  type Owner,
  sessionTrades,
  setSessionStatus,
  setupTags,
  TradingError,
  updateSession,
} from '@trading/backtest/server';
import { equityCurve, maxDrawdown, rDistribution, rMultiple, tradeStats } from '@trading/core';
import { listInstruments } from '@trading/market-data/server';
import { connection } from 'next/server';
import type { ActionResult } from '@/lib/action-result';
import { getDb } from '@/lib/server/db';
import { backtestOwner } from '@/lib/server/viewer';

/** Setup tags are the owner's journal tags: null (no Setup field) for invited users (Joe, 26 Oct 2026). */
const tagsFor = (db: NonNullable<ReturnType<typeof getDb>>, owner: Owner) =>
  owner === null ? setupTags(db) : Promise.resolve(null);

/** The viewer's runs (backtester spec §7) with what the create/edit form needs. */
export async function getSessionsPage() {
  await connection();
  const db = getDb();
  const owner = await backtestOwner();
  if (!db || owner === undefined) return null;
  const [sessions, tags, instruments] = await Promise.all([
    listSessions(db, owner),
    tagsFor(db, owner),
    listInstruments(db),
  ]);
  return {
    sessions,
    tags,
    instruments: instruments.map((i) => ({ code: i.code, defaultSpreadPoints: i.defaultSpreadPoints })),
  };
}

/** One of the viewer's runs: stats (one definition, from @trading/core), equity curve and trades. */
export async function getSessionDetail(id: string) {
  await connection();
  const db = getDb();
  const owner = await backtestOwner();
  if (!db || owner === undefined) return null;
  if (
    !(await assertOwnsSession(db, owner, id).then(
      () => true,
      () => false,
    ))
  )
    return null;
  const session = await getSessionView(db, id);
  if (!session) return null;
  const [trades, tags, instruments] = await Promise.all([
    sessionTrades(db, id),
    tagsFor(db, owner),
    listInstruments(db),
  ]);
  const curve = equityCurve(trades);
  return {
    session,
    trades: trades.map((t) => ({ ...t, r: rMultiple(t.netProfit, t.riskUsd) })),
    stats: tradeStats(trades),
    drawdown: maxDrawdown(
      trades.map((t) => t.netProfit),
      session.startingBalance,
    ),
    curve: curve.map((p, i) => ({
      i: i + 1,
      at: p.at.getTime(),
      equity: p.equity.toNumber(),
      pnl: p.equity.minus(curve[i - 1]?.equity ?? 0).toNumber(),
    })),
    r: rDistribution(trades),
    ambiguous: trades.filter((t) => t.ambiguous).length,
    tags,
    instruments: instruments.map((i) => ({ code: i.code, defaultSpreadPoints: i.defaultSpreadPoints })),
  };
}

async function run<T>(
  fn: (db: NonNullable<ReturnType<typeof getDb>>, owner: Owner) => Promise<T>,
): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  const owner = await backtestOwner();
  if (owner === undefined) return { ok: false, error: 'Sign in again.' };
  try {
    return { ok: true, data: await fn(db, owner) };
  } catch (error) {
    if (error instanceof TradingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'The run could not be saved.' };
  }
}

/** Invited users' runs never carry one of the owner's setup tags. */
const withoutTag = (input: SessionInput, owner: Owner): SessionInput =>
  owner === null ? input : { ...input, setupTagId: null };

export const createBacktestSession = (input: SessionInput) =>
  run((db, owner) => createSession(db, owner, withoutTag(input, owner)));
export const updateBacktestSession = (id: string, input: SessionInput) =>
  run(async (db, owner) => {
    await assertOwnsSession(db, owner, id);
    await updateSession(db, id, withoutTag(input, owner));
  });
export const setBacktestSessionStatus = (id: string, status: 'in_progress' | 'completed') =>
  run(async (db, owner) => {
    await assertOwnsSession(db, owner, id);
    await setSessionStatus(db, id, status);
  });
export const deleteBacktestSession = (id: string) =>
  run(async (db, owner) => {
    await assertOwnsSession(db, owner, id);
    await deleteSession(db, id);
  });
