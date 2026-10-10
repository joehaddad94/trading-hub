import { describe, expect, it } from 'vitest';
import { dayRange, monthRange, tradingDay } from './days';
import { sessionOf, sessionRuns } from './sessions';

describe('sessionOf (kill zones, America/New_York)', () => {
  // 9 Oct 2026: New York is UTC-4 (EDT)
  it.each([
    ['2026-10-09T00:00:00Z', 'asia'], // 20:00 ET
    ['2026-10-09T03:59:00Z', 'asia'], // 23:59 ET
    ['2026-10-09T04:00:00Z', 'outside'], // 00:00 ET
    ['2026-10-09T06:00:00Z', 'london'], // 02:00 ET
    ['2026-10-09T09:00:00Z', 'outside'], // 05:00 ET end exclusive
    ['2026-10-09T13:30:00Z', 'ny_am'], // 09:30 ET
    ['2026-10-09T13:46:59Z', 'ny_am'], // fixture trade 16:46:59 +03:00
    ['2026-10-09T16:00:00Z', 'outside'], // 12:00 ET
    ['2026-10-09T17:30:00Z', 'ny_pm'], // 13:30 ET
    ['2026-10-09T20:00:00Z', 'outside'], // 16:00 ET
  ] as const)('%s → %s', (iso, expected) => {
    expect(sessionOf(new Date(iso))).toBe(expected);
  });

  it('follows DST: 09:30 ET in December is 14:30Z', () => {
    expect(sessionOf(new Date('2026-12-01T14:30:00Z'))).toBe('ny_am');
    expect(sessionOf(new Date('2026-12-01T13:30:00Z'))).toBe('outside');
  });
});

describe('tradingDay', () => {
  it('uses Beirut midnight by default (UTC+3 summer, UTC+2 winter)', () => {
    expect(tradingDay(new Date('2026-10-09T20:59:59Z'))).toBe('2026-10-09');
    expect(tradingDay(new Date('2026-10-09T21:00:00Z'))).toBe('2026-10-10');
    expect(tradingDay(new Date('2026-12-01T21:59:59Z'))).toBe('2026-12-01');
    expect(tradingDay(new Date('2026-12-01T22:00:00Z'))).toBe('2026-12-02');
  });

  it('crosses the Beirut DST change (last Sunday of October)', () => {
    // Beirut falls back at 00:00 on 25 Oct 2026 (to 23:00 on the 24th), so the 25th starts at 22:00Z
    expect(tradingDay(new Date('2026-10-24T21:30:00Z'))).toBe('2026-10-24');
    expect(tradingDay(new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
    expect(tradingDay(new Date('2026-10-25T21:30:00Z'))).toBe('2026-10-25');
    expect(tradingDay(new Date('2026-10-25T22:00:00Z'))).toBe('2026-10-26');
  });

  it('supports the NY 17:00 rollover', () => {
    const ny = { timeZone: 'America/New_York', rolloverHour: 17 };
    expect(tradingDay(new Date('2026-10-09T20:59:00Z'), ny)).toBe('2026-10-09'); // 16:59 ET
    expect(tradingDay(new Date('2026-10-09T21:00:00Z'), ny)).toBe('2026-10-10'); // 17:00 ET
  });
});

describe('monthRange', () => {
  it('bounds a Beirut month in UTC', () => {
    const { start, end } = monthRange(2026, 10);
    expect(start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-31T22:00:00.000Z');
  });

  it('bounds an NY 17:00 month starting the previous evening', () => {
    const { start } = monthRange(2026, 10, { timeZone: 'America/New_York', rolloverHour: 17 });
    expect(start.toISOString()).toBe('2026-09-30T21:00:00.000Z');
  });
});

describe('dayRange', () => {
  it('is 25 hours on the Beirut fall-back day and agrees with tradingDay', () => {
    const { start, end } = dayRange('2026-10-25');
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T22:00:00.000Z');
    expect(tradingDay(start)).toBe('2026-10-25');
    expect(tradingDay(new Date(start.getTime() - 1))).toBe('2026-10-24');
    expect(tradingDay(new Date(end.getTime() - 1))).toBe('2026-10-25');
  });

  it('crosses month ends and supports the NY 17:00 rollover', () => {
    expect(dayRange('2026-10-31').end.toISOString()).toBe('2026-10-31T22:00:00.000Z');
    const ny = dayRange('2026-10-12', { timeZone: 'America/New_York', rolloverHour: 17 });
    expect(ny.start.toISOString()).toBe('2026-10-11T21:00:00.000Z');
    expect(ny.end.toISOString()).toBe('2026-10-12T21:00:00.000Z');
  });
});

describe('sessionRuns', () => {
  it('groups consecutive bars by kill zone; outside bars break runs', () => {
    // 2026-10-07 (EDT): London 06:00–09:00 UTC, NY AM 13:30–16:00 UTC.
    const at = (iso: string) => Date.parse(`2026-10-07T${iso}:00Z`);
    const bars = ['05:45', '06:00', '06:15', '08:45', '09:00', '13:15', '13:30', '13:45'].map(at);
    expect(sessionRuns(bars)).toEqual([
      { name: 'london', from: at('06:00'), to: at('08:45') },
      { name: 'ny_am', from: at('13:30'), to: at('13:45') },
    ]);
    expect(sessionRuns([])).toEqual([]);
  });
});
