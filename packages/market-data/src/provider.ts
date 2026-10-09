import type { RawCandle } from './candles';

/**
 * Backtester spec §1.1: the data source sits behind this interface so it can be swapped (e.g. futures data).
 * Implementations return 1-minute bid candles whose open time is in [from, to).
 */
export interface MarketDataProvider {
  readonly name: string;
  fetchMinuteCandles(providerCode: string, from: Date, to: Date): Promise<RawCandle[]>;
}
