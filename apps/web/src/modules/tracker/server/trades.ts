import 'server-only';
import { tradeStats } from '@trading/core';
import { type FilterContext, filterOptions, filterTrades, tradesToCsv } from '@trading/tracker';
import { loadTrades, type ResolvedScope } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';
import type { TradeParams } from '../trade-params';
import { getSettings } from './settings';

export const PAGE_SIZE = 50;

async function filtered(scope: ResolvedScope, params: TradeParams) {
  const db = getDb();
  if (!db) return null;
  const settings = await getSettings();
  const all = await loadTrades(db, scope);
  const byId = new Map(scope.accounts.map((a) => [a.id, a]));
  const ctx: FilterContext = { boundary: settings.boundary, loginOf: (id) => String(byId.get(id)?.login ?? '') };
  return { all, rows: filterTrades(all, params, ctx), ctx, settings, byId };
}

/** Trades screen (§8.3 screen 5): the filtered, sorted page plus totals for the whole filtered set. */
export async function getTradesPage(scope: ResolvedScope, params: TradeParams) {
  const f = await filtered(scope, params);
  if (!f) return null;
  const pages = Math.max(1, Math.ceil(f.rows.length / PAGE_SIZE));
  const page = Math.min(params.page, pages);
  return {
    rows: f.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: f.rows.length,
    page,
    pages,
    stats: tradeStats(f.rows, f.settings.scratchThresholdR),
    options: filterOptions(f.all),
  };
}

/** CSV of the filtered view (every page). */
export async function getTradesCsv(scope: ResolvedScope, params: TradeParams) {
  const f = await filtered(scope, params);
  if (!f) return null;
  return tradesToCsv(f.rows, { ...f.ctx, phaseOf: (id) => f.byId.get(id)?.phase ?? '' });
}
