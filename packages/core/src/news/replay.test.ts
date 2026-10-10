import { describe, expect, it } from 'vitest';
import { hideFutureActuals, type ReplayEvent } from './replay';

const event = (iso: string, actual: string | null): ReplayEvent => ({
  id: iso,
  title: 'CPI m/m',
  currency: 'USD',
  impact: 'high',
  eventAt: new Date(iso),
  forecast: '0.3%',
  previous: '0.2%',
  isRestricted: true,
  actual,
});

describe('hideFutureActuals', () => {
  it('keeps the schedule but blanks actuals after the cursor', () => {
    const events = [event('2026-10-07T12:30:00Z', '0.4%'), event('2026-10-07T14:00:00Z', '0.1%')];
    const out = hideFutureActuals(events, new Date('2026-10-07T12:30:00Z'));
    expect(out.map((e) => [e.eventAt.toISOString(), e.actual, e.forecast])).toEqual([
      ['2026-10-07T12:30:00.000Z', '0.4%', '0.3%'],
      ['2026-10-07T14:00:00.000Z', null, '0.3%'],
    ]);
    expect(out[0]).toBe(events[0]);
  });
});
