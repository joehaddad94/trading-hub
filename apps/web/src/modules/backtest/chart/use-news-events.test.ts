import { describe, expect, it } from 'vitest';
import type { ChartEvent } from '../lib/bars-query';
import { eventsInBar, maskAfter, toMarkers } from './use-news-events';

const ev = (iso: string, impact: ChartEvent['impact'], actual: string | null = null): ChartEvent => ({
  id: iso + impact,
  title: `${impact} event`,
  currency: 'USD',
  impact,
  eventAt: iso,
  forecast: null,
  previous: null,
  actual,
  isRestricted: false,
});

describe('news markers', () => {
  const events = [
    ev('2026-10-07T12:30:00Z', 'medium'),
    ev('2026-10-07T12:35:00Z', 'high', '0.4%'),
    ev('2026-10-07T14:00:00Z', 'low'),
  ];

  it('groups events by bar and colours by the most important one', () => {
    expect(toMarkers(events, 15)).toEqual([
      { ts: Date.parse('2026-10-07T12:30:00Z'), color: '#ef4444' },
      { ts: Date.parse('2026-10-07T14:00:00Z'), color: '#eab308' },
    ]);
    expect(toMarkers(events, 5)).toHaveLength(3);
  });

  it('lists the events of the hovered bar without future actuals', () => {
    const bar = Date.parse('2026-10-07T12:30:00Z');
    expect(eventsInBar(events, bar, 15, Date.parse('2026-10-07T12:34:00Z')).map((e) => e.actual)).toEqual([null, null]);
    expect(eventsInBar(events, bar, 15, null).map((e) => e.actual)).toEqual([null, '0.4%']);
    expect(eventsInBar(events, null, 15, null)).toEqual([]);
    expect(maskAfter(events, Date.parse('2026-10-07T12:35:00Z'))[1]?.actual).toBe('0.4%');
  });
});
