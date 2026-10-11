import { getHistoricalRates, type InstrumentType } from 'dukascopy-node';
import type { RawCandle } from '../candles';
import type { MarketDataProvider } from '../provider';
import { createDukascopyS3Provider, type S3Credentials } from './dukascopy-s3';

/** The S3 bucket when keys are configured (the free datafeed refuses bulk downloads since Oct 2026), else the datafeed. */
export function marketDataProvider(
  credentials: {
    [K in keyof S3Credentials]?: string | undefined;
  },
): MarketDataProvider {
  const { accessKeyId, secretAccessKey } = credentials;
  return accessKeyId && secretAccessKey
    ? createDukascopyS3Provider({ accessKeyId, secretAccessKey })
    : dukascopyProvider;
}

/**
 * Dukascopy via dukascopy-node (backtester spec §1.1): free 1m bid candles. Flat (no-tick) minutes are
 * dropped so a missing minute means no trading, which the gap check then judges against market hours.
 */
export const dukascopyProvider: MarketDataProvider = {
  name: 'dukascopy',
  async fetchMinuteCandles(providerCode: string, from: Date, to: Date): Promise<RawCandle[]> {
    return getHistoricalRates({
      instrument: providerCode as InstrumentType,
      dates: { from, to },
      timeframe: 'm1',
      priceType: 'bid',
      format: 'json',
      volumes: true,
      ignoreFlats: true,
      useCache: false,
      retryCount: 3,
      pauseBetweenRetriesMs: 1000,
      failAfterRetryCount: true,
    });
  },
};
