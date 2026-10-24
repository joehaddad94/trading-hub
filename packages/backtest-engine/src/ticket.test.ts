import { describe, expect, it } from 'vitest';
import {
  defaultStopPoints,
  flipTicket,
  followPrice,
  newTicket,
  openPnl,
  partOf,
  pendingType,
  signedUsd,
  ticketValid,
} from './ticket';

describe('order ticket', () => {
  it('starts at the price with a 0.1% stop and a 1:2 target', () => {
    expect(defaultStopPoints(46000, 2)).toBe(46);
    expect(newTicket('long', 46000, 2)).toEqual({ side: 'long', kind: 'market', entry: 46000, sl: 45954, tp: 46092 });
    expect(newTicket('short', 46000, 2)).toEqual({ side: 'short', kind: 'market', entry: 46000, sl: 46046, tp: 45908 });
  });

  it('reuses a given stop distance', () => {
    expect(newTicket('long', 46000.5, 2, 20)).toMatchObject({ sl: 45980.5, tp: 46040.5 });
  });

  it('a market ticket follows the price keeping distances; a pending one stays', () => {
    const t = newTicket('long', 46000, 2);
    expect(followPrice(t, 46010.25, 2)).toMatchObject({ entry: 46010.25, sl: 45964.25, tp: 46102.25 });
    const pending = { ...t, kind: 'pending' as const };
    expect(followPrice(pending, 46010.25, 2)).toBe(pending);
  });

  it('flips side with mirrored levels', () => {
    expect(flipTicket(newTicket('long', 46000, 2), 2)).toMatchObject({ side: 'short', sl: 46046, tp: 45908 });
  });

  it('types a pending order like the server: buy limit below, buy stop above', () => {
    expect(pendingType('long', 45990, 46000)).toBe('limit');
    expect(pendingType('long', 46010, 46000)).toBe('stop');
    expect(pendingType('short', 46010, 46000)).toBe('limit');
    expect(pendingType('short', 45990, 46000)).toBe('stop');
  });

  it('checks the stop and target sides', () => {
    expect(ticketValid({ side: 'long', entry: 10, sl: 9, tp: 12 })).toBe(true);
    expect(ticketValid({ side: 'long', entry: 10, sl: 11, tp: 12 })).toBe(false);
    expect(ticketValid({ side: 'short', entry: 10, sl: 11, tp: 8 })).toBe(true);
  });

  it('open profit is direction × move × lots × point value', () => {
    expect(openPnl({ side: 'long', fill: '46000', lots: '0.5' }, 46010, '1')).toBe('5.00');
    expect(openPnl({ side: 'short', fill: '46000', lots: '0.5' }, 46010, '1')).toBe('-5.00');
  });

  it('parts of a position round down to 0.01 lots, never below it', () => {
    expect(partOf('0.27', 0.5)).toBe('0.13');
    expect(partOf('1.00', 0.25)).toBe('0.25');
    expect(partOf('0.01', 0.5)).toBe('0.01');
  });

  it('signs money for labels', () => {
    expect(signedUsd('12.50')).toBe('+$12.50');
    expect(signedUsd('-3.00')).toBe('−$3.00');
    expect(signedUsd('-0.00')).toBe('$0.00');
  });
});
