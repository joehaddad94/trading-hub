import 'server-only';
import { newsSplit, type ResolvedScope, tradeNews } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';
import { getSettings } from './settings';

export async function getTradeNews(tradeId: string) {
  const db = getDb();
  return db ? tradeNews(db, tradeId) : null;
}

export async function getNewsSplit(scope: ResolvedScope) {
  const db = getDb();
  if (!db) return null;
  const { boundary, scratchThresholdR } = await getSettings();
  return newsSplit(db, scope, { boundary, scratchThresholdR });
}
