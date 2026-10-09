import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { type TrackerHubSummary, trackerHubSummary } from '@trading/tracker/server';
import { getDb } from '@/lib/server/db';

/** Tracker card numbers for the hub (§8.0). Null when there is no database or the query fails. */
export async function getTrackerHubSummary(): Promise<TrackerHubSummary | null> {
  const db = getDb();
  if (!db) return null;
  try {
    return await trackerHubSummary(db);
  } catch (error) {
    Sentry.captureException(error);
    return null;
  }
}
