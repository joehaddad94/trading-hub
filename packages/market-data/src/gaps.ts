import { isMarketOpen } from './hours';

export type Gap = { from: string; to: string; minutes: number };

/** Spec §1.3: a gap is this many consecutive expected minutes with no candle. Shorter holes are quiet markets. */
export const MIN_GAP_MINUTES = 15;

/**
 * Missing runs of minutes in [from, to) during trading hours. `present` holds the candle open times found.
 * Pure: the caller passes the candles' timestamps.
 */
export function findGaps(from: Date, to: Date, present: Iterable<Date>, minMinutes = MIN_GAP_MINUTES): Gap[] {
  const have = new Set<number>();
  for (const ts of present) have.add(ts.getTime());
  const gaps: Gap[] = [];
  let start: number | null = null;
  let length = 0;
  const close = (end: number) => {
    if (start !== null && length >= minMinutes) {
      gaps.push({ from: new Date(start).toISOString(), to: new Date(end).toISOString(), minutes: length });
    }
    start = null;
    length = 0;
  };
  for (let t = from.getTime(); t < to.getTime(); t += 60_000) {
    if (!isMarketOpen(new Date(t))) {
      close(t);
      continue;
    }
    if (have.has(t)) {
      close(t);
      continue;
    }
    start ??= t;
    length += 1;
  }
  close(to.getTime());
  return gaps;
}
