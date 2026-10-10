import type { CalendarEvent } from './week';

export type ReplayEvent = CalendarEvent & { actual: string | null };

/**
 * News spec §4 (backtester part): the schedule is known in advance, so events after the replay cursor may be
 * shown, but an `actual` must stay hidden until the cursor has passed the release.
 */
export function hideFutureActuals<E extends ReplayEvent>(events: E[], until: Date): E[] {
  return events.map((e) => (e.eventAt.getTime() > until.getTime() && e.actual !== null ? { ...e, actual: null } : e));
}
