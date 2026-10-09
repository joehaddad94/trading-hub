import { describe, expect, it } from 'vitest';
import { backfillWindow, daysBetween, parseUtcDay, previousUtcDay, utcDayRange } from './days';

describe('days', () => {
  it('parses strict UTC days', () => {
    expect(parseUtcDay('2026-10-07')?.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(parseUtcDay('2026-02-30')).toBeNull();
    expect(parseUtcDay('7/10/2026')).toBeNull();
    expect(() => utcDayRange('nope')).toThrow();
  });

  it('gives the previous UTC day and day lists', () => {
    expect(previousUtcDay(new Date('2026-10-09T04:00:00Z'))).toBe('2026-10-08');
    expect(daysBetween('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(() => daysBetween('x', '2026-01-01')).toThrow();
  });

  it('backfills 12 months ending yesterday', () => {
    expect(backfillWindow(new Date('2026-10-09T10:00:00Z'))).toEqual({ from: '2025-10-09', to: '2026-10-08' });
  });
});
