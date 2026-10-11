import { describe, expect, it } from 'vitest';
import { bi5DayKey, parseBi5MinuteCandles } from './bi5';

function record(view: DataView, i: number, r: [number, number, number, number, number, number]) {
  const at = i * 24;
  for (let k = 0; k < 5; k++) view.setUint32(at + k * 4, r[k] as number);
  view.setFloat32(at + 20, r[5]);
}

describe('bi5DayKey', () => {
  it('uses the upper-case code and a 0-based month', () => {
    expect(bi5DayKey('usa30idxusd', new Date('2026-10-08T00:00:00Z'))).toBe(
      'USA30IDXUSD/2026/09/08/BID_candles_min_1.bi5',
    );
    expect(bi5DayKey('usatechidxusd', new Date('2026-01-01T00:00:00Z'))).toBe(
      'USATECHIDXUSD/2026/00/01/BID_candles_min_1.bi5',
    );
  });
});

describe('parseBi5MinuteCandles', () => {
  const day = Date.parse('2026-10-08T00:00:00Z');

  it('decodes records (real values from 8 Oct 2026) and drops flat minutes', () => {
    const buf = new Uint8Array(24 * 3);
    const view = new DataView(buf.buffer);
    record(view, 0, [0, 51161439, 51160987, 51156915, 51166987, 0.004284]);
    record(view, 1, [60, 51160987, 51160987, 51160987, 51160987, 0]);
    record(view, 2, [52200, 51088163, 51090199, 51078151, 51095115, 0.03012]);
    const rows = parseBi5MinuteCandles(buf, day);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      timestamp: day,
      open: 51161.439,
      close: 51160.987,
      low: 51156.915,
      high: 51166.987,
    });
    expect(rows[1]?.timestamp).toBe(Date.parse('2026-10-08T14:30:00Z'));
  });

  it('returns nothing for an empty file and rejects a truncated one', () => {
    expect(parseBi5MinuteCandles(new Uint8Array(0), day)).toEqual([]);
    expect(() => parseBi5MinuteCandles(new Uint8Array(25), day)).toThrow(/Corrupt/);
  });
});
