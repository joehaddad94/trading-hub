import { describe, expect, it } from 'vitest';
import { lastExpectedRun } from './schedule';

const iso = (d: Date) => d.toISOString();

describe('lastExpectedRun (00:20 Beirut, Tue–Sat)', () => {
  it('summer (UTC+3): Saturday 00:20 Beirut = Friday 21:20Z', () => {
    expect(iso(lastExpectedRun(new Date('2026-10-10T12:00:00Z')))).toBe('2026-10-09T21:20:00.000Z');
  });

  it('exactly at run time counts', () => {
    expect(iso(lastExpectedRun(new Date('2026-10-09T21:20:00Z')))).toBe('2026-10-09T21:20:00.000Z');
    expect(iso(lastExpectedRun(new Date('2026-10-09T21:19:59Z')))).toBe('2026-10-08T21:20:00.000Z');
  });

  it('Sunday and Monday have no run: falls back to Saturday', () => {
    // Monday 12 Oct 2026, 18:00 Beirut
    expect(iso(lastExpectedRun(new Date('2026-10-12T15:00:00Z')))).toBe('2026-10-09T21:20:00.000Z');
  });

  it('winter (UTC+2): Tuesday 00:20 Beirut = Monday 22:20Z', () => {
    expect(iso(lastExpectedRun(new Date('2026-12-01T06:00:00Z')))).toBe('2026-11-30T22:20:00.000Z');
  });
});
