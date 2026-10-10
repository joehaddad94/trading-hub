import { type Ohlc, rma, type Series, trueRange } from './core';

export type AtrSettings = { length: number };
export const ATR_DEFAULTS: AtrSettings = { length: 14 };

/** ATR as TradingView computes it (`ta.atr`): Wilder's RMA of the true range. */
export function atr(bars: Ohlc[], { length }: AtrSettings = ATR_DEFAULTS): Series {
  return rma(trueRange(bars), length);
}
