import 'server-only';
import { overview, type ResolvedScope } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';
import { getSettings } from './settings';

export async function getOverview(scope: ResolvedScope) {
  const db = getDb();
  if (!db) return null;
  return overview(db, scope, await getSettings());
}
