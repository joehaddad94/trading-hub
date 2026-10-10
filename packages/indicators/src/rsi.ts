import { rma, type Series } from './core';

export type RsiSettings = { length: number; overbought: number; oversold: number };
export const RSI_DEFAULTS: RsiSettings = { length: 14, overbought: 70, oversold: 30 };

/**
 * RSI as TradingView computes it (`ta.rsi(close, length)`): Wilder's RMA of gains and losses.
 * 100 when there are no losses, 0 when there are no gains.
 */
export function rsi(closes: number[], { length }: Pick<RsiSettings, 'length'> = RSI_DEFAULTS): Series {
  const gains: Series = closes.map((c, i) => (i === 0 ? null : Math.max(c - (closes[i - 1] as number), 0)));
  const losses: Series = closes.map((c, i) => (i === 0 ? null : Math.max((closes[i - 1] as number) - c, 0)));
  const up = rma(gains, length);
  const down = rma(losses, length);
  return up.map((u, i) => {
    const d = down[i];
    if (u === null || d === null || d === undefined) return null;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}
