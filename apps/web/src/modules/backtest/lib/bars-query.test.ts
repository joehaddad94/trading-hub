import { describe, expect, it } from 'vitest';
import { parseBarsQuery, parseEventsQuery } from './bars-query';

const q = (s: string) => parseBarsQuery(new URLSearchParams(s));

describe('parseBarsQuery', () => {
  it('requires until', () => {
    expect(q('instrument=US30&tf=5').success).toBe(false);
    const ok = q('instrument=US30&tf=5&until=2026-10-07T14:37:00Z&count=100');
    expect(ok.success && ok.data).toEqual({
      instrument: 'US30',
      tf: 5,
      until: new Date('2026-10-07T14:37:00Z'),
      count: 100,
    });
  });

  it('rejects other timeframes, bad dates and unknown params', () => {
    expect(q('instrument=US30&tf=60&until=2026-10-07T14:37:00Z').success).toBe(false);
    expect(q('instrument=US30&tf=1&until=yesterday').success).toBe(false);
    expect(q('instrument=US30&tf=1&until=2026-10-07T14:37:00Z&peek=1').success).toBe(false);
    expect(q('instrument=us30;drop&tf=1&until=2026-10-07T14:37:00Z').success).toBe(false);
  });
});

describe('parseEventsQuery', () => {
  it('parses impacts and currencies and bounds the window', () => {
    const ok = parseEventsQuery(
      new URLSearchParams(
        'from=2026-01-01T00:00:00Z&to=2026-10-20T00:00:00Z&until=2026-10-07T14:37:00Z&impact=high,medium&currency=USD',
      ),
    );
    expect(ok.success && [ok.data.impact, ok.data.currency]).toEqual([['high', 'medium'], ['USD']]);
    expect(
      parseEventsQuery(
        new URLSearchParams('from=2024-01-01T00:00:00Z&to=2026-10-20T00:00:00Z&until=2026-10-07T14:37:00Z&impact=high'),
      ).success,
    ).toBe(false);
    expect(
      parseEventsQuery(
        new URLSearchParams('from=2026-01-01T00:00:00Z&to=2026-10-20T00:00:00Z&until=2026-10-07T14:37:00Z&impact=huge'),
      ).success,
    ).toBe(false);
    expect(parseEventsQuery(new URLSearchParams('from=x&to=y&until=z&impact=high')).success).toBe(false);
  });
});
