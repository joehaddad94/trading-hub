import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SessionInput } from '@trading/backtest';
import {
  createSession,
  deleteSession,
  getSessionView,
  listSessions,
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

/** Sessions list (backtester spec §7) with what the create/edit form needs. */
export async function getSessionsPage() {
  await connection();
  const db = getDb();
  if (!db) return null;
  const [sessions, tags, instruments] = await Promise.all([listSessions(db), setupTags(db), listInstruments(db)]);
  return {
    sessions,
    tags,
    instruments: instruments.map((i) => ({ code: i.code, defaultSpreadPoints: i.defaultSpreadPoints })),
  };
}

/** A session's stats (one definition, from @trading/core), equity curve and trades. */
export async function getSessionDetail(id: string) {
  await connection();
  const db = getDb();
  if (!db) return null;
  const session = await getSessionView(db, id);
  if (!session) return null;
  const [trades, tags, instruments] = await Promise.all([sessionTrades(db, id), setupTags(db), listInstruments(db)]);
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

async function run<T>(fn: (db: NonNullable<ReturnType<typeof getDb>>) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  try {
    return { ok: true, data: await fn(db) };
  } catch (error) {
    if (error instanceof TradingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'The session could not be saved.' };
  }
}

export const createBacktestSession = (input: SessionInput) => run((db) => createSession(db, input));
export const updateBacktestSession = (id: string, input: SessionInput) => run((db) => updateSession(db, id, input));
export const setBacktestSessionStatus = (id: string, status: 'in_progress' | 'completed') =>
  run((db) => setSessionStatus(db, id, status));
export const deleteBacktestSession = (id: string) => run((db) => deleteSession(db, id));
