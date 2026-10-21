import { describe, expect, it } from 'vitest';
import { atMarket, stepBackRule, timeframeForKey } from './chart-workspace';
import { barsUrl, toKLine } from './loader';

describe('chart helpers', () => {
  it('allows stepping back only with no live order, and not past the last closed trade', () => {
    expect(stepBackRule([])).toEqual({ blocked: null, floor: null });
    expect(stepBackRule([{ status: 'open', closedAt: null }]).blocked).toMatch(/Close or cancel/);
    expect(
      stepBackRule([
        { status: 'closed', closedAt: 100 },
        { status: 'closed', closedAt: 300 },
      ]),
    ).toEqual({ blocked: null, floor: 300 });
  });

  it('moves a market position to the price on screen, keeping stop and target distances', () => {
    const box = [
      { ts: 1, price: 100 },
      { ts: 2, price: 90 },
      { ts: 2, price: 120 },
    ];
    expect(atMarket(box, 104).map((p) => p.price)).toEqual([104, 94, 124]);
    expect(atMarket(box, null)).toBe(box);
  });

  it('maps the timeframe shortcuts', () => {
    expect([timeframeForKey('1'), timeframeForKey('5'), timeframeForKey('f'), timeframeForKey('F')]).toEqual([
      1, 5, 15, 15,
    ]);
    expect(timeframeForKey('2')).toBeNull();
  });

  it('builds the candles URL with until always set', () => {
    expect(
      barsUrl({
        instrument: 'US30',
        tf: 15,
        until: new Date('2026-10-07T14:37:00Z'),
        before: new Date('2026-10-07T10:00:00Z'),
        count: 500,
      }),
    ).toBe(
      '/api/backtest/candles?instrument=US30&tf=15&until=2026-10-07T14%3A37%3A00.000Z&before=2026-10-07T10%3A00%3A00.000Z&count=500',
    );
    expect(toKLine({ ts: 1, open: 2, high: 3, low: 1, close: 2, volume: 4 })).toEqual({
      timestamp: 1,
      open: 2,
      high: 3,
      low: 1,
      close: 2,
      volume: 4,
    });
  });
});
