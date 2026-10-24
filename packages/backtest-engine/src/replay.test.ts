import { describe, expect, it } from 'vitest';
import { aggregate, type Bar } from './bars';
import {
  applyMinutes,
  barsPerTick,
  cursorForBar,
  playIntervalMs,
  stepBackTarget,
  stepTarget,
  stepTargetBy,
} from './replay';

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

describe('replay start and pace', () => {
  it('starts replay at the last minute of the clicked bar', () => {
    expect(iso(cursorForBar(at('2026-10-07T14:30:00Z'), 15))).toBe('2026-10-07T14:44:00.000Z');
    expect(iso(cursorForBar(at('2026-10-07T14:31:00Z'), 1))).toBe('2026-10-07T14:31:00.000Z');
  });

  it('paces play', () => {
    expect([1, 2, 5, 10, 20].map((s) => playIntervalMs(s as 1))).toEqual([1000, 500, 200, 100, 50]);
  });
});

describe('playback under lag', () => {
  it('steps several bars at once', () => {
    expect(iso(stepTargetBy(at('2026-10-07T14:44:00Z'), 5, 'bar', 3))).toBe('2026-10-07T14:59:00.000Z');
    expect(iso(stepTargetBy(at('2026-10-07T14:44:00Z'), 5, 'bar', 0))).toBe('2026-10-07T14:49:00.000Z');
  });

  it('reveals more bars per tick only when a step is slower than the tick', () => {
    expect(barsPerTick(40, 50)).toBe(1);
    expect(barsPerTick(120, 50)).toBe(3);
    expect(barsPerTick(5000, 50)).toBe(10);
  });
});

describe('stepBackTarget', () => {
  it('goes back one whole bar or one minute', () => {
    expect(iso(stepBackTarget(at('2026-10-07T14:49:00Z'), 5, 'bar'))).toBe('2026-10-07T14:44:00.000Z');
    // Mid-bar: the forming bar disappears.
    expect(iso(stepBackTarget(at('2026-10-07T14:47:00Z'), 5, 'bar'))).toBe('2026-10-07T14:44:00.000Z');
    expect(iso(stepBackTarget(at('2026-10-07T14:47:00Z'), 5, 'minute'))).toBe('2026-10-07T14:46:00.000Z');
    expect(iso(stepBackTarget(at('2026-10-07T14:47:00Z'), 1, 'bar'))).toBe('2026-10-07T14:46:00.000Z');
  });
});
