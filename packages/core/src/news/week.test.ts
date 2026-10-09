import { describe, expect, it } from 'vitest';
import {
  activeRestrictions,
  type CalendarEvent,
  countdown,
  groupWeek,
  mondayOf,
  nextEvent,
  parseWeek,
  shiftWeek,
  weekRange,
} from './week';

const ev = (id: string, iso: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  currency: 'USD',
  impact: 'high',
  eventAt: new Date(iso),
  forecast: null,
  previous: null,
  isRestricted: false,
  ...extra,
});

describe('weeks', () => {
  it('finds the Monday and parses the week param', () => {
    expect(mondayOf('2026-10-09')).toBe('2026-10-05');
    expect(mondayOf('2026-10-05')).toBe('2026-10-05');
    expect(mondayOf('2026-10-11')).toBe('2026-10-05');
    expect(parseWeek('2026-10-08', new Date())).toBe('2026-10-05');
    // Friday 23:30 UTC is already Saturday in Beirut; still the same week.
    expect(parseWeek('nonsense', new Date('2026-10-09T23:30:00Z'))).toBe('2026-10-05');
    expect(parseWeek(null, new Date('2026-10-11T21:30:00Z'))).toBe('2026-10-12');
    expect(shiftWeek('2026-10-05', -1)).toBe('2026-09-28');
  });

  it('covers Monday to Monday in Beirut time across the DST change', () => {
    const r = weekRange('2026-10-19');
    expect(r.start.toISOString()).toBe('2026-10-18T21:00:00.000Z');
    // Beirut falls back to UTC+2 on 25 Oct.
    expect(r.end.toISOString()).toBe('2026-10-25T22:00:00.000Z');
  });
});

describe('groupWeek', () => {
  it('shows Mon–Fri, adds weekend days with events, and groups same-time events', () => {
    const days = groupWeek('2026-10-05', [
      ev('cad-emp', '2026-10-09T12:30:00Z', { currency: 'CAD' }),
      ev('cad-unemp', '2026-10-09T12:30:00Z', { currency: 'CAD' }),
      ev('ism', '2026-10-05T14:00:00Z'),
      ev('sunday', '2026-10-11T10:00:00Z'),
    ]);
    expect(days.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-11',
    ]);
    const friday = days[4];
    expect(friday?.slots).toHaveLength(1);
    expect(friday?.slots[0]?.events.map((e) => e.id)).toEqual(['cad-emp', 'cad-unemp']);
  });
});

describe('next event, restrictions and countdown', () => {
  const events = [
    ev('past', '2026-10-07T18:00:00Z', { isRestricted: true }),
    ev('holiday', '2026-10-08T00:00:00Z', { impact: 'holiday' }),
    ev('fomc', '2026-10-08T18:00:00Z', { isRestricted: true }),
  ];

  it('skips past events and holidays for the next one', () => {
    expect(nextEvent(events, new Date('2026-10-07T20:00:00Z'))?.id).toBe('fomc');
    expect(nextEvent(events, new Date('2026-10-09T00:00:00Z'))).toBeNull();
  });

  it('flags the restriction window around restricted high-impact events', () => {
    const w = { minutesBefore: 5, minutesAfter: 5 };
    expect(activeRestrictions(events, new Date('2026-10-08T17:55:00Z'), w).map((e) => e.id)).toEqual(['fomc']);
    expect(activeRestrictions(events, new Date('2026-10-08T18:05:00Z'), w).map((e) => e.id)).toEqual(['fomc']);
    expect(activeRestrictions(events, new Date('2026-10-08T18:05:01Z'), w)).toEqual([]);
    expect(activeRestrictions(events, new Date('2026-10-08T17:54:59Z'), w)).toEqual([]);
  });

  it('formats the countdown', () => {
    const now = new Date('2026-10-08T12:00:00Z');
    expect(countdown(new Date('2026-10-08T18:05:00Z'), now)).toBe('in 6h 05m');
    expect(countdown(new Date('2026-10-08T12:04:09Z'), now)).toBe('in 4m 09s');
    expect(countdown(new Date('2026-10-10T13:00:00Z'), now)).toBe('in 2d 1h');
    expect(countdown(new Date('2026-10-08T11:59:59Z'), now)).toBeNull();
  });
});
