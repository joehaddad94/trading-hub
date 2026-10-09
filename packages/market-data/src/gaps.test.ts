import { describe, expect, it } from 'vitest';
import { findGaps } from './gaps';
import { isMarketOpen } from './hours';

const from = new Date('2026-10-07T00:00:00Z');
const to = new Date('2026-10-08T00:00:00Z');

function minutes(skip: (t: Date) => boolean): Date[] {
  const out: Date[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
    const d = new Date(t);
    if (isMarketOpen(d) && !skip(d)) out.push(d);
  }
  return out;
}

const between = (a: string, b: string) => (d: Date) =>
  d >= new Date(`2026-10-07T${a}:00Z`) && d < new Date(`2026-10-07T${b}:00Z`);

describe('findGaps', () => {
  it('finds nothing in a complete day (the daily break is expected)', () => {
    expect(
      findGaps(
        from,
        to,
        minutes(() => false),
      ),
    ).toEqual([]);
  });

  it('flags 15+ missing minutes during trading hours, ignores short quiet holes', () => {
    const a = between('10:00', '10:20');
    const b = between('12:00', '12:05');
    expect(
      findGaps(
        from,
        to,
        minutes((d) => a(d) || b(d)),
      ),
    ).toEqual([{ from: '2026-10-07T10:00:00.000Z', to: '2026-10-07T10:20:00.000Z', minutes: 20 }]);
  });

  it('splits a hole at the daily break and flags one running to the end of the range', () => {
    const around = between('20:50', '22:10');
    const tail = (d: Date) => d >= new Date('2026-10-07T23:45:00Z');
    expect(
      findGaps(
        from,
        to,
        minutes((d) => around(d) || tail(d)),
      ),
    ).toEqual([{ from: '2026-10-07T23:45:00.000Z', to: '2026-10-08T00:00:00.000Z', minutes: 15 }]);
  });

  it('flags a whole missing day', () => {
    const gaps = findGaps(from, to, []);
    expect(gaps.map((g) => g.minutes)).toEqual([1260, 120]);
  });

  it('expects nothing on a Saturday', () => {
    expect(findGaps(new Date('2026-10-10T00:00:00Z'), new Date('2026-10-11T00:00:00Z'), [])).toEqual([]);
  });
});
