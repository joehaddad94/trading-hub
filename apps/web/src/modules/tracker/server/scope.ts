import 'server-only';
import { parseScope } from '@trading/core';
import { listScopeAccounts, type ResolvedScope, resolveScope, scopedTrades } from '@trading/tracker/server';
import { connection } from 'next/server';
import type { SearchParams } from 'nuqs/server';
import { getDb } from '@/lib/server/db';
import type { ScopeOption } from '../scope-label';
import { loadTrackerSearchParams } from '../search-params';

/** The scope of the current Tracker page (§8.1). Null when the database isn't configured. */
export async function getPageScope(searchParams: Promise<SearchParams>): Promise<ResolvedScope | null> {
  await connection();
  const db = getDb();
  if (!db) return null;
  const { scope } = await loadTrackerSearchParams(searchParams);
  return resolveScope(db, parseScope(scope));
}

/** Options for the header scope selector. */
export async function getScopeOptions(): Promise<ScopeOption[]> {
  await connection();
  const db = getDb();
  if (!db) return [];
  const rows = await listScopeAccounts(db);
  return rows.map(({ login, phase, status, isDemo, journeyRootLogin }) => ({
    login,
    phase,
    status,
    isDemo,
    journeyRootLogin,
  }));
}

/** The current scope and its closed trades, for pages that show scope-wide numbers. */
export async function getScopeTrades(searchParams: Promise<SearchParams>) {
  const scope = await getPageScope(searchParams);
  const db = getDb();
  if (!scope || !db) return null;
  return { scope, trades: await scopedTrades(db, scope) };
}
