import { describe, expect, it } from 'vitest';
import { expectedMinutes, goodFriday, isMarketOpen, isReducedDay } from './hours';

const at = (iso: string) => new Date(iso);

describe('isMarketOpen', () => {
  it('trades through the day with a 16:15–18:00 ET break (EDT: 20:15–22:00 UTC)', () => {
    expect(isMarketOpen(at('2026-10-07T15:00:00Z'))).toBe(true);
    expect(isMarketOpen(at('2026-10-07T20:14:00Z'))).toBe(true);
    expect(isMarketOpen(at('2026-10-07T20:15:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-10-07T21:59:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-10-07T22:00:00Z'))).toBe(true);
  });

  it('moves the break with DST (EST: 21:15–23:00 UTC)', () => {
    expect(isMarketOpen(at('2026-01-14T21:14:00Z'))).toBe(true);
    expect(isMarketOpen(at('2026-01-14T21:30:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-01-14T22:30:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-01-14T23:00:00Z'))).toBe(true);
  });

  it('closes from Friday 16:15 ET to Sunday 18:00 ET', () => {
    expect(isMarketOpen(at('2026-10-09T20:14:00Z'))).toBe(true);
    expect(isMarketOpen(at('2026-10-09T20:15:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-10-10T12:00:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-10-11T21:59:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-10-11T22:00:00Z'))).toBe(true);
  });

  it('expects nothing on holidays and early-close days', () => {
    expect(isMarketOpen(at('2026-11-26T15:00:00Z'))).toBe(false); // Thanksgiving
    expect(isMarketOpen(at('2026-12-25T15:00:00Z'))).toBe(false);
    expect(isMarketOpen(at('2026-04-03T15:00:00Z'))).toBe(false); // Good Friday
  });
});

describe('holidays', () => {
  it('computes Good Friday', () => {
    expect(goodFriday(2026)).toEqual([3, 3]);
    expect(goodFriday(2025)).toEqual([3, 18]);
    expect(goodFriday(2027)).toEqual([2, 26]);
  });

  it('computes the floating US holidays', () => {
    expect(isReducedDay(2026, 0, 19)).toBe(true); // MLK
    expect(isReducedDay(2026, 1, 16)).toBe(true); // Presidents'
    expect(isReducedDay(2026, 4, 25)).toBe(true); // Memorial
    expect(isReducedDay(2026, 8, 7)).toBe(true); // Labor
    expect(isReducedDay(2026, 10, 27)).toBe(true); // Black Friday
    expect(isReducedDay(2026, 9, 7)).toBe(false);
  });
});

describe('expectedMinutes', () => {
  const day = (d: string) => [at(`${d}T00:00:00Z`), at(`${d}T00:00:00Z`)] as const;
  it('counts trading minutes in a UTC day', () => {
    const [from] = day('2026-10-07');
    const next = (d: Date) => new Date(d.getTime() + 86_400_000);
    expect(expectedMinutes(from, next(from))).toBe(1335);
    expect(expectedMinutes(at('2026-10-09T00:00:00Z'), at('2026-10-10T00:00:00Z'))).toBe(1215);
    expect(expectedMinutes(at('2026-10-10T00:00:00Z'), at('2026-10-11T00:00:00Z'))).toBe(0);
    expect(expectedMinutes(at('2026-10-11T00:00:00Z'), at('2026-10-12T00:00:00Z'))).toBe(120);
  });
});
