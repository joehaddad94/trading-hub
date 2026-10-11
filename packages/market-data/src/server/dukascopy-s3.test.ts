import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dukascopyProvider } from './dukascopy';
import { candleProvider, decodeDayFile, dukascopyKey, dukascopyS3Provider } from './dukascopy-s3';

const fixture = readFileSync(
  new URL('../../test/fixtures/USA30IDXUSD_2026-01-05_BID_candles_min_1.bi5', import.meta.url),
);

describe('Dukascopy S3 archive', () => {
  it('names day files with zero-based months', () => {
    expect(dukascopyKey('usa30idxusd', '2026-01-05')).toBe('USA30IDXUSD/2026/00/05/BID_candles_min_1.bi5');
    expect(dukascopyKey('usatechidxusd', '2026-12-31')).toBe('USATECHIDXUSD/2026/11/31/BID_candles_min_1.bi5');
  });

  it('decompresses an LZMA day file into minute candles', () => {
    const rows = decodeDayFile('usa30idxusd', '2026-01-05', fixture);
    expect(rows).toEqual([
      {
        timestamp: Date.parse('2026-01-05T00:00:00Z'),
        open: 42_000.5,
        high: 42_003.25,
        low: 41_999,
        close: 42_002,
        volume: 1.5,
      },
      {
        timestamp: Date.parse('2026-01-05T00:02:00Z'),
        open: 42_002,
        high: 42_004,
        low: 42_000,
        close: 42_001,
        volume: 2,
      },
    ]);
    expect(decodeDayFile('usa30idxusd', '2026-01-05', new Uint8Array())).toEqual([]);
    expect(() => decodeDayFile('eurusd', '2026-01-05', fixture)).toThrow(/No price scale/);
  });

  it('uses S3 only when AWS credentials are set', () => {
    expect(candleProvider({})).toBe(dukascopyProvider);
    expect(candleProvider({ AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b' })).toBe(dukascopyS3Provider);
  });
});
