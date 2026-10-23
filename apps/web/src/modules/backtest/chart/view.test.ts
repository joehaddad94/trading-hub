import { describe, expect, it } from 'vitest';
import { isAtLatest, isClick, keepViewShift } from './view';

describe('keepViewShift', () => {
  it('keeps the bars in place while the new bar fits', () => {
    // Previous last bar at 400 slid left to 390 when a 10px bar was added; the new bar is at 400.
    expect(keepViewShift({ before: 400, after: 390, newest: 400, limit: 700 })).toBe(10);
  });

  it('follows when the chart was pinned to the right margin', () => {
    expect(keepViewShift({ before: 700, after: 690, newest: 700, limit: 700 })).toBe(0);
  });

  it('follows only as far as needed near the margin', () => {
    expect(keepViewShift({ before: 695, after: 685, newest: 695, limit: 700 })).toBe(5);
  });

  it('does nothing when the chart already kept its place (last bar off screen)', () => {
    expect(keepViewShift({ before: 900, after: 900, newest: 910, limit: 700 })).toBe(0);
  });
});

describe('isClick', () => {
  it('treats a press and release in place as a click, and a pan as no click', () => {
    expect(isClick({ x: 10, y: 10 }, { x: 13, y: 12 })).toBe(true);
    expect(isClick({ x: 10, y: 10 }, { x: 60, y: 10 })).toBe(false);
  });
});

describe('isAtLatest', () => {
  it('is true while the newest bar is in the visible range', () => {
    expect(isAtLatest({ realTo: 500 }, 500)).toBe(true);
    expect(isAtLatest({ realTo: 520 }, 500)).toBe(true);
    expect(isAtLatest({ realTo: 420 }, 500)).toBe(false);
    expect(isAtLatest({ realTo: 0 }, 0)).toBe(true);
  });
});
