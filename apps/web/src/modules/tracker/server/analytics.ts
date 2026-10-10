import 'server-only';
import { analytics, liveVsBacktestReport, type ResolvedScope } from '@trading/tracker/server';
import { DISPLAY_TZ } from '@/lib/format';
import { getDb } from '@/lib/server/db';
import { getSettings } from './settings';

export async function getAnalytics(scope: ResolvedScope) {
  const db = getDb();
  if (!db) return null;
  const { scratchThresholdR } = await getSettings();
  return analytics(db, scope, { timezone: DISPLAY_TZ, scratchThresholdR });
}

export async function getLiveVsBacktest(scope: ResolvedScope) {
  const db = getDb();
  if (!db) return null;
  const { scratchThresholdR } = await getSettings();
  return liveVsBacktestReport(db, scope, scratchThresholdR);
}
