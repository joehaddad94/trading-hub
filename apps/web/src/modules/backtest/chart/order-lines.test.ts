import type { OrderView } from '@trading/backtest';
import { describe, expect, it } from 'vitest';
import { orderMarks, withPreview } from './order-lines';

const T0 = Date.UTC(2026, 9, 1, 14, 0);
const MIN = 60_000;

function order(over: Partial<OrderView>): OrderView {
  return {
    id: 'a',
    instrument: 'US30',
    side: 'long',
    type: 'market',
    status: 'open',
    lots: '1.00',
    entry: '100',
    sl: '90',
    tp: '120',
    placedAt: T0,
    fillPrice: '100',
    filledAt: T0,
    closePrice: null,
    closedAt: null,
    exitReason: null,
    ambiguous: false,
    drawingId: null,
    tradeId: null,
    net: null,
    r: null,
    ...over,
  };
}

describe('orderMarks', () => {
  it('gives an open trade a box from its fill at its stop and target', () => {
    const [m] = orderMarks([order({})], 'US30', 1);
    expect(m).toMatchObject({ kind: 'live', id: 'a', from: T0, entry: 100, sl: 90, tp: 120, pending: false });
  });

  it('freezes a closed trade at its exit with its result', () => {
    const [m] = orderMarks(
      [
        order({
          status: 'closed',
          closedAt: T0 + 5 * MIN,
          closePrice: '120',
          exitReason: 'tp',
          net: '200.00',
          r: '2.00',
        }),
      ],
      'US30',
      1,
    );
    expect(m).toMatchObject({ kind: 'closed', from: T0, to: T0 + 5 * MIN, sl: 90, tp: 120, box: true, win: true });
    expect(m?.kind === 'closed' && m.result).toBe('+$200.00 · 2.00R');
  });

  it('draws one box for a partly closed position: the open rest owns it', () => {
    const rest = order({ id: 'b', lots: '0.50' });
    const part = order({
      id: 'c',
      lots: '0.50',
      status: 'closed',
      closedAt: T0 + 2 * MIN,
      closePrice: '105',
      net: '25',
    });
    const marks = orderMarks([rest, part], 'US30', 1);
    expect(marks.find((m) => m.id === 'c')).toMatchObject({ kind: 'closed', box: false });
    expect(marks.find((m) => m.id === 'b')).toMatchObject({ kind: 'live' });
  });

  it('once every part is closed, the last one to close draws the box', () => {
    const early = order({ id: 'c', status: 'closed', closedAt: T0 + 2 * MIN, closePrice: '105', net: '25' });
    const late = order({ id: 'b', status: 'closed', closedAt: T0 + 9 * MIN, closePrice: '90', net: '-50' });
    const marks = orderMarks([early, late], 'US30', 1);
    expect(marks.find((m) => m.id === 'b')).toMatchObject({ box: true });
    expect(marks.find((m) => m.id === 'c')).toMatchObject({ box: false, result: '' });
  });

  it('sums the parts of a split position into one result', () => {
    const a = order({ id: 'b', status: 'closed', closedAt: T0 + 9 * MIN, closePrice: '120', net: '100.00', r: '2.00' });
    const b = order({ id: 'c', status: 'closed', closedAt: T0 + 2 * MIN, closePrice: '105', net: '25.00', r: '0.50' });
    // Risk 50 + 50: 125 / 100 = 1.25R.
    expect(orderMarks([a, b], 'US30', 1).find((m) => m.id === 'b')).toMatchObject({ result: '+$125.00 · 1.25R' });
  });

  it('keeps separate trades as separate boxes', () => {
    const one = order({ id: 'b', status: 'closed', closedAt: T0 + 2 * MIN, closePrice: '105', net: '25' });
    const two = order({ id: 'c', status: 'closed', filledAt: T0 + 4 * MIN, closedAt: T0 + 6 * MIN, closePrice: '95' });
    expect(orderMarks([one, two], 'US30', 1).every((m) => m.kind === 'closed' && m.box)).toBe(true);
  });

  it('a pending order is a box from where it was placed', () => {
    const [m] = orderMarks([order({ status: 'pending', type: 'limit', fillPrice: null, filledAt: null })], 'US30', 1);
    expect(m).toMatchObject({ kind: 'live', pending: true, from: T0, entry: 100 });
  });
});

describe('withPreview', () => {
  const marks = orderMarks([order({})], 'US30', 1);

  it('moves the dragged edge of the box', () => {
    expect(withPreview(marks, { id: 'a', level: 'sl', price: 95 })[0]).toMatchObject({ sl: 95, tp: 120 });
  });

  it("never moves a filled trade's entry", () => {
    expect(withPreview(marks, { id: 'a', level: 'entry', price: 95 })[0]).toMatchObject({ entry: 100 });
  });

  it('leaves other orders alone', () => {
    expect(withPreview(marks, { id: 'z', level: 'tp', price: 130 })).toEqual(marks);
  });
});
