import type { Chart } from 'klinecharts';

/**
 * Time axis labels as on TradingView: ticks sit on round times (14:00, 14:30, …) in the chart's time zone, and
 * a day, month or year boundary is labelled with the day number, month name or year instead of the time.
 * KLineCharts' own axis puts a label every N bars, so it lands on odd times such as 13:43, 14:21, 14:59.
 */

const MIN = 1;
const HOUR = 60;
const DAY = 1440;
/** Trading minutes in a day, week, month and year: used only to guess how wide a step will be on screen. */
const TRADING_DAY = 23 * HOUR;

type Unit = 'minute' | 'day' | 'week' | 'month' | 'year';
type Step = { unit: Unit; size: number; approxMin: number };

const STEPS: Step[] = [
  ...[1, 2, 5, 10, 15, 30].map((n) => ({ unit: 'minute' as const, size: n * MIN, approxMin: n * MIN })),
  ...[1, 2, 3, 4, 6, 12].map((n) => ({ unit: 'minute' as const, size: n * HOUR, approxMin: n * HOUR })),
  { unit: 'day', size: 1, approxMin: TRADING_DAY },
  { unit: 'week', size: 1, approxMin: 5 * TRADING_DAY },
  { unit: 'month', size: 1, approxMin: 21 * TRADING_DAY },
  { unit: 'month', size: 3, approxMin: 63 * TRADING_DAY },
  { unit: 'month', size: 6, approxMin: 126 * TRADING_DAY },
  { unit: 'year', size: 1, approxMin: 252 * TRADING_DAY },
];

/** Gap (px) the labels keep between them at least. */
export const MIN_LABEL_GAP_PX = 80;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Smallest round step whose labels stay `minGapPx` apart at this bar width. */
export function pickStep(intervalMin: number, barPx: number, minGapPx = MIN_LABEL_GAP_PX): Step {
  const fits = STEPS.filter((s) => s.approxMin >= intervalMin);
  return fits.find((s) => (s.approxMin / intervalMin) * barPx >= minGapPx) ?? (fits.at(-1) as Step);
}

type Local = { year: number; month: number; day: number; minute: number; epochDay: number };

/** Offset from UTC (ms) of `timeZone`, cached per UTC hour (zones change offset only on the hour). */
function offsetReader(timeZone: string): (ts: number) => number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  const cache = new Map<number, number>();
  return (ts) => {
    const hour = Math.floor(ts / 3_600_000);
    let off = cache.get(hour);
    if (off === undefined) {
      const at = hour * 3_600_000;
      const parts = fmt.formatToParts(at);
      const n = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((x) => x.type === type)?.value ?? 0);
      off = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute')) - at;
      cache.set(hour, off);
    }
    return off;
  };
}

function toLocal(ts: number, offset: (ts: number) => number): Local {
  const d = new Date(ts + offset(ts));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    minute: d.getUTCHours() * 60 + d.getUTCMinutes(),
    epochDay: Math.floor(d.getTime() / 86_400_000),
  };
}

/** Which step-sized slot of local time a bar falls in; a tick goes where this changes. */
function slot(l: Local, step: Step): number {
  switch (step.unit) {
    case 'minute':
      return l.epochDay * DAY + Math.floor(l.minute / step.size) * step.size;
    case 'day':
      return l.epochDay;
    case 'week':
      // 1 Jan 1970 was a Thursday; +3 makes weeks start on Monday.
      return Math.floor((l.epochDay + 3) / 7);
    case 'month':
      return l.year * 12 + Math.floor(l.month / step.size) * step.size;
    case 'year':
      return l.year;
  }
}

export type TimeTick = { index: number; text: string };

/** Higher ranks win when two labels would overlap: year > month > day > time. */
function label(prev: Local | null, l: Local): { text: string; rank: number } {
  if (prev && l.year !== prev.year) return { text: String(l.year), rank: 3 };
  if (prev && l.month !== prev.month) return { text: MONTHS[l.month] as string, rank: 2 };
  if (prev && l.epochDay !== prev.epochDay) return { text: String(l.day), rank: 1 };
  const hh = String(Math.floor(l.minute / 60)).padStart(2, '0');
  const mm = String(l.minute % 60).padStart(2, '0');
  return { text: `${hh}:${mm}`, rank: 0 };
}

/**
 * Ticks for the bars `timestamps[i]` at data index `first + i`. Pass the bar before the first visible one too
 * (when there is one) so a boundary on the first visible bar is found.
 */
export function timeAxisTicks(p: {
  timestamps: number[];
  first: number;
  /** Data index of the first bar on screen; earlier entries only decide whether it starts a new slot. */
  visibleFrom: number;
  barPx: number;
  intervalMin: number;
  timeZone: string;
  minGapPx?: number;
}): TimeTick[] {
  const gap = p.minGapPx ?? MIN_LABEL_GAP_PX;
  const step = pickStep(p.intervalMin, p.barPx, gap);
  const offset = offsetReader(p.timeZone);
  const kept: { index: number; text: string; rank: number }[] = [];
  let prev: Local | null = null;
  let prevSlot: number | null = null;
  for (let i = 0; i < p.timestamps.length; i++) {
    const l = toLocal(p.timestamps[i] as number, offset);
    const s = slot(l, step);
    const index = p.first + i;
    if (prevSlot !== null && s !== prevSlot && index >= p.visibleFrom) {
      const { text, rank } = label(prev, l);
      const last = kept.at(-1);
      if (!last || (index - last.index) * p.barPx >= gap) kept.push({ index, text, rank });
      else if (rank > last.rank) kept[kept.length - 1] = { index, text, rank };
    }
    prev = l;
    prevSlot = s;
  }
  return kept.map(({ index, text }) => ({ index, text }));
}

/** Swaps the chart's every-N-bars time axis for round-time ticks. Call once after `init`. */
export function applyRoundTimeAxis(chart: Chart): void {
  chart.overrideXAxis({
    createTicks: ({ range, defaultTicks }) => {
      const data = chart.getDataList();
      const period = chart.getPeriod();
      if (data.length === 0 || !period) return defaultTicks;
      const visibleFrom = Math.max(0, Math.floor(range.realFrom));
      const to = Math.min(data.length - 1, Math.ceil(range.realTo));
      if (to < visibleFrom) return defaultTicks;
      const first = Math.max(0, visibleFrom - 1);
      const timestamps: number[] = [];
      for (let i = first; i <= to; i++) timestamps.push((data[i] as { timestamp: number }).timestamp);
      const intervalMin =
        period.type === 'minute' ? period.span : period.type === 'hour' ? period.span * HOUR : period.span * DAY;
      const ticks = timeAxisTicks({
        timestamps,
        first,
        visibleFrom,
        barPx: chart.getBarSpace().bar,
        intervalMin,
        timeZone: chart.getTimezone(),
      });
      return ticks.flatMap(({ index, text }) => {
        const x = (chart.convertToPixel({ dataIndex: index }, { paneId: 'candle_pane' }) as { x?: number }).x;
        return typeof x === 'number' && Number.isFinite(x)
          ? [{ coord: x, value: data[index]?.timestamp ?? index, text }]
          : [];
      });
    },
  });
}
