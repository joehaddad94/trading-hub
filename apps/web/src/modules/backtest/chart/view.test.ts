import { describe, expect, it } from 'vitest';
import { keepViewShift } from './view';

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
