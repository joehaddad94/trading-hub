import { formatBeirut } from './format';

export type TimeTicks = { ticks: number[]; pattern: string };

/**
 * X-axis ticks for a per-trade curve (one point per closed trade, `times` in ms, oldest first).
 * Points stay evenly spaced so bursts of trades stay readable; ticks sit on the first trade of each
 * Beirut day (labelled `d MMM`), thinned to at most `max`. A single-day curve gets evenly spaced
 * `HH:mm` ticks instead.
 */
export function tradeAxisTicks(times: number[], max = 6): TimeTicks {
  if (times.length === 0) return { ticks: [], pattern: 'd MMM' };
  const dayStarts: number[] = [];
  let lastDay = '';
  times.forEach((t, i) => {
    const day = formatBeirut(new Date(t), 'yyyy-MM-dd');
    if (day !== lastDay) dayStarts.push(i);
    lastDay = day;
  });
  if (dayStarts.length > 1) return { ticks: thin(dayStarts, max), pattern: 'd MMM' };
  return { ticks: thin([...times.keys()], max), pattern: 'HH:mm' };
}

/** Keep at most `max` items, evenly spread, always including the first and last. */
function thin(xs: number[], max: number): number[] {
  if (xs.length <= max) return xs;
  const step = (xs.length - 1) / (max - 1);
  return [...new Set(Array.from({ length: max }, (_, k) => xs[Math.round(k * step)] as number))];
}
