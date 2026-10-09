import { describe, expect, it } from 'vitest';
import { monthRange, tradingDay } from './days';
import { sessionOf } from './sessions';

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
