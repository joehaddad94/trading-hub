import { createLoader, parseAsString } from 'nuqs/server';

/** Tracker URL state (spec §8.1). `shallow: false` so server components re-query on change. */
export const trackerSearchParams = {
  scope: parseAsString.withDefault('all').withOptions({ shallow: false, history: 'push' }),
};

export const loadTrackerSearchParams = createLoader(trackerSearchParams);

/** Query params every Tracker nav link carries to the next page. */
export const TRACKER_KEPT_PARAMS = ['scope'];
