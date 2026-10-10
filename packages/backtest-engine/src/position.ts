import Decimal from 'decimal.js';

/**
 * Long/short position tool maths (backtester spec §4): RR, points to SL/TP, $ risk/reward and lot size.
 * Money in decimal.js (CLAUDE.md rule 5); chart prices arrive as numbers and are converted via their string form.
 */
export type Side = 'long' | 'short';

export type Sizing =
  | { mode: 'lots'; value: string }
  | { mode: 'risk_usd'; value: string }
  | { mode: 'risk_pct'; value: string };

export type PositionInput = {
  side: Side;
  entry: number;
  stop: number;
  target: number;
  /** USD per 1.0 price move per lot (instruments.point_value_per_lot). */
  pointValue: string;
  balance: string;
  sizing: Sizing;
};

export type PositionMetrics = {
  /** Stop below entry for a long, above for a short; target on the other side. */
  valid: boolean;
  slPoints: string;
  tpPoints: string;
  /** Reward ÷ risk, 2 dp ("2.00" = 1:2). */
  rr: string;
  lots: string;
  riskUsd: string;
  rewardUsd: string;
  riskPct: string;
};

export const DEFAULT_RR = 2;
export const LOT_STEP = new Decimal('0.01');

const dec = (n: number) => new Decimal(String(n));

/** Lot size from the sizing choice, rounded down to the 0.01 lot step. */
export function lotsFor(sizing: Sizing, slPoints: Decimal, pointValue: Decimal, balance: Decimal): Decimal {
  if (sizing.mode === 'lots') return new Decimal(sizing.value).toNearest(LOT_STEP, Decimal.ROUND_DOWN);
  const riskPerLot = slPoints.times(pointValue);
  if (riskPerLot.isZero()) return new Decimal(0);
  const risk = sizing.mode === 'risk_usd' ? new Decimal(sizing.value) : balance.times(sizing.value).div(100);
  return risk.div(riskPerLot).toNearest(LOT_STEP, Decimal.ROUND_DOWN);
}

export function positionMetrics(input: PositionInput): PositionMetrics {
  const entry = dec(input.entry);
  const stop = dec(input.stop);
  const target = dec(input.target);
  const pointValue = new Decimal(input.pointValue);
  const balance = new Decimal(input.balance);
  const sign = input.side === 'long' ? 1 : -1;
  const valid = entry.minus(stop).times(sign).gt(0) && target.minus(entry).times(sign).gt(0);
  const slPoints = entry.minus(stop).abs();
  const tpPoints = target.minus(entry).abs();
  const lots = lotsFor(input.sizing, slPoints, pointValue, balance);
  const riskUsd = slPoints.times(pointValue).times(lots);
  const rewardUsd = tpPoints.times(pointValue).times(lots);
  return {
    valid,
    slPoints: slPoints.toFixed(2),
    tpPoints: tpPoints.toFixed(2),
    rr: slPoints.isZero() ? '0.00' : tpPoints.div(slPoints).toFixed(2),
    lots: lots.toFixed(2),
    riskUsd: riskUsd.toFixed(2),
    rewardUsd: rewardUsd.toFixed(2),
    riskPct: balance.isZero() ? '0.00' : riskUsd.div(balance).times(100).toFixed(2),
  };
}

/**
 * Default levels for a new position tool at `entry`: stop `stopPoints` away on the losing side and the
 * target at `rr` × that distance on the winning side.
 */
export function defaultLevels(side: Side, entry: number, stopPoints: number, rr = DEFAULT_RR) {
  const sign = side === 'long' ? 1 : -1;
  const e = dec(entry);
  const d = dec(stopPoints);
  return {
    stop: e.minus(d.times(sign)).toNumber(),
    target: e.plus(d.times(rr).times(sign)).toNumber(),
  };
}

/** Measure tool readout: price change (points and %), bars and time between two points. */
export function measure(a: { ts: number; price: number }, b: { ts: number; price: number }, bars: number) {
  const change = dec(b.price).minus(dec(a.price));
  return {
    points: change.toFixed(2),
    pct: dec(a.price).isZero() ? '0.00' : change.div(dec(a.price)).times(100).toFixed(2),
    bars,
    ms: b.ts - a.ts,
  };
}

/** "1h 25m" / "2d 3h" / "15m" for the measure tool. */
export function formatSpan(ms: number): string {
  const minutes = Math.round(Math.abs(ms) / 60_000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
