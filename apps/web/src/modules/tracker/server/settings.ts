import 'server-only';
import { DEFAULT_SETTINGS, getTrackerSettings, type TrackerSettings } from '@trading/tracker/server';
import { cache } from 'react';
import { getDb } from '@/lib/server/db';

/** Day boundary and scratch threshold, read once per request. */
export const getSettings = cache(async (): Promise<TrackerSettings> => {
  const db = getDb();
  return db ? getTrackerSettings(db) : DEFAULT_SETTINGS;
});
