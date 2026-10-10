'use client';

import { bucketStart, type Timeframe } from '@trading/backtest-engine';
import { IMPACT_COLOURS } from '@trading/core';
import { useEffect, useRef, useState } from 'react';
import type { ChartEvent } from '../lib/bars-query';
import type { Marker } from './news-markers';

const DAY = 86_400_000;
/** One request covers a year behind the reference time and two weeks ahead (the schedule is public). */
const BACK = 370 * DAY;
const AHEAD = 14 * DAY;
const RANK = { high: 0, medium: 1, low: 2, holiday: 3 } as const;

export type NewsFilter = { impacts: ChartEvent['impact'][]; currencies: string[] };

/**
 * Events for the chart's markers. Fetched with `until` = cursor (or now), so actuals of later releases come
 * back blank; refetched when the cursor passes an event (to reveal its actual) or leaves the window.
 */
export function useNewsEvents(cursor: number | null, filter: NewsFilter, enabled: boolean) {
  const [events, setEvents] = useState<ChartEvent[]>([]);
  const fetched = useRef<{ key: string; from: number; to: number; until: number } | null>(null);
  const key = `${filter.impacts.join(',')}|${filter.currencies.join(',')}`;

  useEffect(() => {
    if (!enabled || filter.impacts.length === 0) {
      setEvents([]);
      fetched.current = null;
      return;
    }
    const ref = cursor ?? Date.now();
    const last = fetched.current;
    const passedEvent =
      last !== null && events.some((e) => Date.parse(e.eventAt) > last.until && Date.parse(e.eventAt) <= ref);
    const inWindow = last !== null && last.key === key && ref >= last.from + 30 * DAY && ref <= last.to - 7 * DAY;
    if (inWindow && !passedEvent && ref >= last.until) return;
    // Restarted earlier than before: drop actuals that are now in the future until the refetch lands.
    if (last !== null && ref < last.until) setEvents((current) => maskAfter(current, ref));
    const window = { key, from: ref - BACK, to: ref + AHEAD, until: ref };
    fetched.current = window;
    const q = new URLSearchParams({
      from: new Date(window.from).toISOString(),
      to: new Date(window.to).toISOString(),
      until: new Date(ref).toISOString(),
      impact: filter.impacts.join(','),
    });
    if (filter.currencies.length) q.set('currency', filter.currencies.join(','));
    const controller = new AbortController();
    fetch(`/api/backtest/events?${q}`, { signal: controller.signal, cache: 'no-store' })
      .then((r) => r.json() as Promise<{ ok: true; data: ChartEvent[] } | { ok: false; error: string }>)
      .then((body) => {
        if (body.ok) setEvents(body.data);
      })
      .catch(() => {
        fetched.current = null;
      });
    return () => controller.abort();
  }, [cursor, key, enabled, events, filter.impacts, filter.currencies]);

  return events;
}

/** One marker per `tf` bar, coloured by its most important event. */
export function toMarkers(events: ChartEvent[], tf: Timeframe): Marker[] {
  const byBar = new Map<number, ChartEvent>();
  for (const e of events) {
    const ts = bucketStart(Date.parse(e.eventAt), tf);
    const current = byBar.get(ts);
    if (!current || RANK[e.impact] < RANK[current.impact]) byBar.set(ts, e);
  }
  return [...byBar.entries()].map(([ts, e]) => ({ ts, color: IMPACT_COLOURS[e.impact] }));
}

/** Second guard on the client: never show an actual released after `cursor`. */
export function maskAfter(events: ChartEvent[], cursor: number): ChartEvent[] {
  return events.map((e) => (Date.parse(e.eventAt) > cursor && e.actual !== null ? { ...e, actual: null } : e));
}

/** Events inside the `tf` bar under the crosshair, with actuals after the cursor hidden. */
export function eventsInBar(
  events: ChartEvent[],
  barStart: number | null,
  tf: Timeframe,
  cursor: number | null,
): ChartEvent[] {
  if (barStart === null) return [];
  const inBar = events.filter((e) => bucketStart(Date.parse(e.eventAt), tf) === barStart);
  return cursor === null ? inBar : maskAfter(inBar, cursor);
}
