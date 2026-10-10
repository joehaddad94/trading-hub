import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import {
  advance,
  type Costs,
  checkExit,
  closeAtMarket,
  NO_COSTS,
  type PendingOrder,
  type SimState,
  tradeResult,
  tryFill,
  validLevels,
} from './fills';

const M = 60_000;
const T0 = Date.UTC(2026, 9, 7, 14, 0);
const bar = (i: number, open: number, high: number, low: number, close: number): Bar => ({
  ts: T0 + i * M,
  open,
  high,
  low,
  close,
  volume: 1,
});
const COSTS: Costs = { spreadPoints: '2', commissionPerLot: '3', slippagePoints: '0.5' };

const order = (o: Partial<PendingOrder>): PendingOrder => ({
  side: 'long',
  type: 'market',
  entry: '100',
  sl: '90',
  tp: '120',
  placedAt: T0,
  ...o,
});

describe('tryFill', () => {
  it('market buy: next bar open + spread + slippage; SL/TP keep their distances', () => {
    expect(tryFill(order({}), bar(0, 100, 101, 99, 100), COSTS)).toBeNull(); // not after the cursor
    expect(tryFill(order({}), bar(1, 101, 102, 100, 101), COSTS)).toEqual({
      price: '103.5',
      at: T0 + M,
      sl: '93.5',
      tp: '123.5',
    });
  });

  it('market sell fills at the bid open minus slippage', () => {
    const f = tryFill(order({ side: 'short', sl: '110', tp: '80' }), bar(1, 101, 102, 100, 101), COSTS);
    expect(f).toMatchObject({ price: '100.5', sl: '110.5', tp: '80.5' });
  });

  it('buy limit fills at the level, or at a better gap open', () => {
    const o = order({ type: 'limit', entry: '95', sl: '90', tp: '105' });
    // Ask low = 94 + 2 = 96: not reached with a 2-point spread.
    expect(tryFill(o, bar(1, 100, 101, 94, 99), { ...NO_COSTS, spreadPoints: '2' })).toBeNull();
    expect(tryFill(o, bar(1, 100, 101, 94, 99), NO_COSTS)?.price).toBe('95');
    expect(tryFill(o, bar(1, 92, 93, 91, 92), NO_COSTS)?.price).toBe('92');
  });

  it('sell limit fills when bid reaches the level', () => {
    const o = order({ side: 'short', type: 'limit', entry: '105', sl: '110', tp: '95' });
    expect(tryFill(o, bar(1, 100, 104, 99, 103), NO_COSTS)).toBeNull();
    expect(tryFill(o, bar(1, 100, 106, 99, 103), NO_COSTS)?.price).toBe('105');
    expect(tryFill(o, bar(1, 107, 108, 106, 107), NO_COSTS)?.price).toBe('107');
  });

  it('stop orders fill at the level or a worse gap open, plus slippage', () => {
    const buy = order({ type: 'stop', entry: '105', sl: '100', tp: '115' });
    expect(tryFill(buy, bar(1, 100, 104, 99, 103), NO_COSTS)).toBeNull();
    expect(tryFill(buy, bar(1, 100, 106, 99, 103), { ...NO_COSTS, slippagePoints: '1' })?.price).toBe('106');
    expect(tryFill(buy, bar(1, 108, 109, 107, 108), NO_COSTS)?.price).toBe('108');
    const sell = order({ side: 'short', type: 'stop', entry: '95', sl: '100', tp: '85' });
    expect(tryFill(sell, bar(1, 100, 101, 96, 99), NO_COSTS)).toBeNull();
    expect(tryFill(sell, bar(1, 100, 101, 94, 99), NO_COSTS)?.price).toBe('95');
    expect(tryFill(sell, bar(1, 93, 94, 92, 93), NO_COSTS)?.price).toBe('93');
  });
});

describe('checkExit', () => {
  const long = { side: 'long' as const, fillPrice: '100', filledAt: T0, sl: '90', tp: '120' };
  const short = { side: 'short' as const, fillPrice: '100', filledAt: T0, sl: '110', tp: '80' };

  it('SL first when a bar touches both (ambiguous)', () => {
    expect(checkExit(long, bar(1, 100, 121, 89, 100), NO_COSTS)).toMatchObject({
      price: '90',
      reason: 'sl',
      ambiguous: true,
    });
  });

  it('TP and SL at their levels, slippage on stops only', () => {
    const c = { ...NO_COSTS, slippagePoints: '1' };
    expect(checkExit(long, bar(1, 100, 121, 95, 100), c)).toMatchObject({ price: '120', reason: 'tp' });
    expect(checkExit(long, bar(1, 100, 101, 89, 100), c)).toMatchObject({ price: '89', reason: 'sl' });
    expect(checkExit(long, bar(1, 100, 101, 95, 100), c)).toBeNull();
  });

  it('gaps fill at the open', () => {
    expect(checkExit(long, bar(1, 85, 86, 84, 85), NO_COSTS)).toMatchObject({ price: '85', gap: true, reason: 'sl' });
    expect(checkExit(long, bar(1, 125, 126, 124, 125), NO_COSTS)).toMatchObject({ price: '125', gap: true });
  });

  it('shorts exit at ask', () => {
    // ask high = 108 + 2 = 110 hits the stop.
    expect(checkExit(short, bar(1, 100, 108, 95, 100), COSTS)).toMatchObject({ price: '110.5', reason: 'sl' });
    // ask low = 78 + 2 = 80 hits the target.
    expect(checkExit(short, bar(1, 100, 101, 78, 100), COSTS)).toMatchObject({ price: '80', reason: 'tp' });
  });

  it('a stop at the fill price is a breakeven exit', () => {
    expect(checkExit({ ...long, sl: '100' }, bar(1, 101, 102, 99, 100), NO_COSTS)?.reason).toBe('breakeven');
  });

  it('on the fill bar only the stop counts', () => {
    expect(checkExit(long, bar(1, 100, 121, 95, 100), NO_COSTS, true)).toBeNull();
    expect(checkExit(long, bar(1, 85, 121, 84, 100), NO_COSTS, true)).toMatchObject({ reason: 'sl', price: '90' });
  });

  it('close at market uses the cursor bar close', () => {
    expect(closeAtMarket(long, bar(3, 100, 105, 99, 104), COSTS)).toMatchObject({ price: '103.5', reason: 'manual' });
    expect(closeAtMarket(short, bar(3, 100, 105, 99, 104), COSTS).price).toBe('106.5');
  });
});

describe('tradeResult', () => {
  it('P/L, commission, net and R at the initial stop', () => {
    const r = tradeResult(
      { side: 'long', lots: '0.5', fillPrice: '100', exitPrice: '120', initialSl: '90' },
      '10',
      COSTS,
    );
    expect(r).toEqual({ profit: '100.00', commission: '-1.50', net: '98.50', riskUsd: '50.00', r: '1.97' });
    const s = tradeResult(
      { side: 'short', lots: '1', fillPrice: '100', exitPrice: '110', initialSl: '110' },
      '10',
      NO_COSTS,
    );
    expect(s).toMatchObject({ profit: '-100.00', net: '-100.00', r: '-1.00' });
    expect(
      tradeResult({ side: 'long', lots: '1', fillPrice: '1', exitPrice: '1', initialSl: '1' }, '10', NO_COSTS).r,
    ).toBeNull();
  });
});

describe('advance', () => {
  it('fills then exits over a sequence of bars, ignoring bars already processed', () => {
    let s: SimState = { status: 'pending', order: order({ type: 'limit', entry: '95', sl: '90', tp: '105' }) };
    s = advance(s, [bar(1, 100, 101, 96, 99)], NO_COSTS);
    expect(s.status).toBe('pending');
    // Fills at 95; this bar's high (106) doesn't count for TP on the fill bar.
    s = advance(s, [bar(2, 99, 106, 94, 100)], NO_COSTS);
    expect(s).toMatchObject({ status: 'open', initialSl: '90', initialTp: '105' });
    s = advance(s, [bar(2, 99, 106, 94, 100), bar(3, 100, 106, 99, 104)], NO_COSTS);
    expect(s).toMatchObject({ status: 'closed', exit: { reason: 'tp', price: '105', at: T0 + 3 * M } });
    expect(advance(s, [bar(4, 1, 1, 1, 1)], NO_COSTS)).toBe(s);
  });

  it('a market order can fill and stop out on the same bar', () => {
    const s = advance({ status: 'pending', order: order({}) }, [bar(1, 100, 100, 80, 85)], NO_COSTS);
    expect(s).toMatchObject({ status: 'closed', exit: { reason: 'sl', price: '90' } });
  });
});

describe('validLevels', () => {
  it('checks sides', () => {
    expect(validLevels('long', '100', '90', '110')).toBe(true);
    expect(validLevels('long', '100', '110', '90')).toBe(false);
    expect(validLevels('short', '100', '110', '90')).toBe(true);
  });
});
