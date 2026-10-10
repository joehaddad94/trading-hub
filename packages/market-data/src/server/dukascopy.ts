import { getHistoricalRates, type InstrumentType } from 'dukascopy-node';
import type { RawCandle } from '../candles';
import type { MarketDataProvider } from '../provider';

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
