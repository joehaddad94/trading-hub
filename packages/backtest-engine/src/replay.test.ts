import { describe, expect, it } from 'vitest';
import { aggregate, type Bar } from './bars';
import { applyMinutes, cursorForBar, nextDayOpen, nextSessionOpen, playIntervalMs, stepTarget } from './replay';

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number) => new Date(ms).toISOString();

describe('stepTarget', () => {
  it('completes the forming bar, then moves one bar at a time', () => {
    expect(iso(stepTarget(at('2026-10-07T14:37:00Z'), 15, 'bar'))).toBe('2026-10-07T14:44:00.000Z');
    expect(iso(stepTarget(at('2026-10-07T14:44:00Z'), 15, 'bar'))).toBe('2026-10-07T14:59:00.000Z');
    expect(iso(stepTarget(at('2026-10-07T14:44:00Z'), 5, 'bar'))).toBe('2026-10-07T14:49:00.000Z');
    expect(iso(stepTarget(at('2026-10-07T14:44:00Z'), 1, 'bar'))).toBe('2026-10-07T14:45:00.000Z');
    expect(iso(stepTarget(at('2026-10-07T14:44:00Z'), 15, 'minute'))).toBe('2026-10-07T14:45:00.000Z');
  });
});

describe('applyMinutes', () => {
  const minute = (i: number, close: number): Bar => ({
    ts: at('2026-10-07T14:30:00Z') + i * 60_000,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
    volume: 1,
  });
  const minutes = Array.from({ length: 31 }, (_, i) => minute(i, 100 + ((i * 7) % 11)));

  it('replaying minute by minute equals aggregating everything at once', () => {
    const shown: Bar[] = [];
    for (const m of minutes) {
      for (const bar of applyMinutes(shown.at(-1) ?? null, [m], 15)) {
        if (shown.at(-1)?.ts === bar.ts) shown[shown.length - 1] = bar;
        else shown.push(bar);
      }
    }
    expect(shown).toEqual(aggregate(minutes, 15));
  });

  it('upserts the forming bar first, then new bars', () => {
    const [first] = aggregate(minutes.slice(0, 3), 15);
    const out = applyMinutes(first ?? null, minutes.slice(3, 17), 15);
    expect(out.map((b) => iso(b.ts))).toEqual(['2026-10-07T14:30:00.000Z', '2026-10-07T14:45:00.000Z']);
    expect(out[0]).toEqual(aggregate(minutes.slice(0, 15), 15)[0]);
    expect(first?.volume).toBe(3);
    expect(applyMinutes(null, [], 5)).toEqual([]);
  });
});

describe('jumps', () => {
  it('finds the next kill-zone open in New York time', () => {
    // 14:37 UTC = 10:37 EDT, inside NY AM → next is NY PM 13:30 EDT = 17:30 UTC.
    expect(nextSessionOpen(at('2026-10-07T14:37:00Z'))).toEqual({ name: 'ny_pm', at: at('2026-10-07T17:30:00Z') });
    // After NY PM opens: Asia at 20:00 EDT = 00:00 UTC next day.
    expect(nextSessionOpen(at('2026-10-07T17:30:00Z'))).toEqual({ name: 'asia', at: at('2026-10-08T00:00:00Z') });
    expect(nextSessionOpen(at('2026-10-07T14:37:00Z'), 'london')).toEqual({
      name: 'london',
      at: at('2026-10-08T06:00:00Z'),
    });
    // Winter time: London 02:00 EST = 07:00 UTC.
    expect(nextSessionOpen(at('2026-01-14T03:00:00Z'), 'london').at).toBe(at('2026-01-14T07:00:00Z'));
  });

  it('finds the next 18:00 ET day open', () => {
    expect(iso(nextDayOpen(at('2026-10-07T14:37:00Z')))).toBe('2026-10-07T22:00:00.000Z');
    expect(iso(nextDayOpen(at('2026-10-07T22:00:00Z')))).toBe('2026-10-08T22:00:00.000Z');
    expect(iso(nextDayOpen(at('2026-01-14T12:00:00Z')))).toBe('2026-01-14T23:00:00.000Z');
  });

  it('starts replay at the last minute of the clicked bar', () => {
    expect(iso(cursorForBar(at('2026-10-07T14:30:00Z'), 15))).toBe('2026-10-07T14:44:00.000Z');
    expect(iso(cursorForBar(at('2026-10-07T14:31:00Z'), 1))).toBe('2026-10-07T14:31:00.000Z');
  });

  it('paces play', () => {
    expect([1, 2, 5, 10, 20].map((s) => playIntervalMs(s as 1))).toEqual([1000, 500, 200, 100, 50]);
  });
});
