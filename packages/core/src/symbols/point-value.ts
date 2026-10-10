import Decimal from 'decimal.js';

/**
 * Tracker spec §5 `symbol_specs`: "verified from data". Each trade implies
 * point value per lot = |profit| / (|close − open| × lots). When enough trades agree, that is the value.
 */
export type PointValueSample = { lots: string; openPrice: string; closePrice: string; profit: string };

export const MIN_SAMPLES = 5;
const TOLERANCE = new Decimal('0.02');
const AGREEMENT = new Decimal('0.9');

export function derivePointValue(samples: PointValueSample[]): string | null {
  const estimates = samples.flatMap((s) => {
    const move = new Decimal(s.closePrice).minus(s.openPrice).abs().times(s.lots);
    const profit = new Decimal(s.profit).abs();
    return move.isZero() || profit.isZero() ? [] : [profit.div(move)];
  });
  if (estimates.length < MIN_SAMPLES) return null;
  estimates.sort((a, b) => a.comparedTo(b));
  const mid = Math.floor(estimates.length / 2);
  const median =
    estimates.length % 2
      ? (estimates[mid] as Decimal)
      : (estimates[mid - 1] as Decimal).plus(estimates[mid] as Decimal).div(2);
  const agreeing = estimates.filter((e) => e.minus(median).abs().lte(median.times(TOLERANCE))).length;
  if (new Decimal(agreeing).div(estimates.length).lt(AGREEMENT)) return null;
  // Contract sizes are round numbers; per-trade rounding of profit causes the scatter.
  return median.toSignificantDigits(3).toFixed(4);
}
