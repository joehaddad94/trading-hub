import { describe, expect, it } from 'vitest';
import { dayToCheck, evaluateCandleHealth, ingestStatus } from './health';

const now = new Date('2026-10-09T08:00:00Z');
const ranAt = new Date('2026-10-09T04:00:10Z');

describe('dayToCheck', () => {
  it('waits until 06:00 UTC before expecting yesterday', () => {
    expect(dayToCheck(new Date('2026-10-09T05:59:00Z'))).toBe('2026-10-07');
    expect(dayToCheck(new Date('2026-10-09T06:00:00Z'))).toBe('2026-10-08');
  });
});

describe('evaluateCandleHealth', () => {
  it('reports each problem once per instrument', () => {
    const conditions = evaluateCandleHealth({
      now,
      instruments: [
        { code: 'A', run: null },
        { code: 'B', run: { status: 'failed', error: 'HTTP 503', gaps: null, ranAt } },
        { code: 'C', run: { status: 'empty', error: null, gaps: null, ranAt } },
        {
          code: 'D',
          run: { status: 'gaps', error: null, gaps: [{ from: 'x', to: 'y', minutes: 20 }], ranAt },
        },
        { code: 'E', run: { status: 'ok', error: null, gaps: null, ranAt } },
        { code: 'F', run: { status: 'failed', error: null, gaps: null, ranAt } },
      ],
    });
    expect(conditions.map((c) => [c.kind, c.message])).toEqual([
      ['candles_missing', 'A: no candle import ran for 2026-10-08.'],
      ['candles_failed', 'B: candle import for 2026-10-08 failed: HTTP 503'],
      ['candles_empty', 'C: candle import for 2026-10-08 returned no candles on a trading day.'],
      ['candles_gaps', "D: 1 gap (20 min) in 2026-10-08's candles."],
      ['candles_failed', 'F: candle import for 2026-10-08 failed.'],
    ]);
  });

  it('pluralises gaps', () => {
    const [c] = evaluateCandleHealth({
      now,
      instruments: [
        {
          code: 'D',
          run: {
            status: 'gaps',
            error: null,
            gaps: [
              { from: 'a', to: 'b', minutes: 15 },
              { from: 'c', to: 'd', minutes: 30 },
            ],
            ranAt,
          },
        },
      ],
    });
    expect(c?.message).toBe("D: 2 gaps (45 min) in 2026-10-08's candles.");
  });
});

describe('ingestStatus', () => {
  it('orders failed > empty > gaps > ok', () => {
    const gap = [{ from: 'a', to: 'b', minutes: 15 }];
    expect(ingestStatus({ error: 'x', rows: 0, expectedMinutes: 1380, gaps: gap })).toBe('failed');
    expect(ingestStatus({ error: null, rows: 0, expectedMinutes: 1380, gaps: gap })).toBe('empty');
    expect(ingestStatus({ error: null, rows: 0, expectedMinutes: 0, gaps: [] })).toBe('ok');
    expect(ingestStatus({ error: null, rows: 10, expectedMinutes: 1380, gaps: gap })).toBe('gaps');
    expect(ingestStatus({ error: null, rows: 10, expectedMinutes: 1380, gaps: [] })).toBe('ok');
  });
});
