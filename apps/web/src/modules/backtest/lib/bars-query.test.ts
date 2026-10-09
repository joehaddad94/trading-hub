import { describe, expect, it } from 'vitest';
import { parseBarsQuery } from './bars-query';

const q = (s: string) => parseBarsQuery(new URLSearchParams(s));

describe('parseBarsQuery', () => {
  it('requires until', () => {
    expect(q('instrument=US30&tf=5').success).toBe(false);
    const ok = q('instrument=US30&tf=5&until=2026-10-07T14:37:00Z&count=100');
    expect(ok.success && ok.data).toEqual({
      instrument: 'US30',
      tf: 5,
      until: new Date('2026-10-07T14:37:00Z'),
      count: 100,
    });
  });

  it('rejects other timeframes, bad dates and unknown params', () => {
    expect(q('instrument=US30&tf=60&until=2026-10-07T14:37:00Z').success).toBe(false);
    expect(q('instrument=US30&tf=1&until=yesterday').success).toBe(false);
    expect(q('instrument=US30&tf=1&until=2026-10-07T14:37:00Z&peek=1').success).toBe(false);
    expect(q('instrument=us30;drop&tf=1&until=2026-10-07T14:37:00Z').success).toBe(false);
  });
});
