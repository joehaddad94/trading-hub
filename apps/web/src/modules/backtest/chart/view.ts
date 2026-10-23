import type { Chart } from 'klinecharts';

/**
 * How far to scroll (px, positive moves the candles right) after replay added bars, so the chart stays where
 * the user put it, as on TradingView: bars already on screen keep their place while the new bar still fits
 * left of the right margin; once it would pass that margin the chart follows, keeping the new bar in view.
 * `before`/`after` are the x of the previous last bar before and after the bars were added, `newest` the x of
 * the new last bar, `limit` the x of the right margin.
 */
export function keepViewShift(p: { before: number; after: number; newest: number; limit: number }): number {
  const keep = p.before - p.after;
  if (keep <= 0) return 0;
  return Math.max(0, Math.min(keep, p.limit - p.newest));
}

/** x of a bar's centre on the price pane, or null when the chart can't place it. */
export function barX(chart: Chart, timestamp: number): number | null {
  const point = chart.convertToPixel({ timestamp }, { paneId: 'candle_pane' }) as { x?: number };
  return typeof point.x === 'number' && Number.isFinite(point.x) ? point.x : null;
}

/** KLineCharts' default gap right of the newest bar, where the chart sits when it follows the price. */
export const RIGHT_MARGIN_PX = 80;

/**
 * x of the right margin: the pane width less the default gap. (The chart's own `getOffsetRightDistance` is the
 * current gap, which grows when the user drags the candles left, so it can't serve as the margin.)
 */
export function rightLimit(chart: Chart): number | null {
  const width = chart.getSize('candle_pane', 'main')?.width;
  return typeof width === 'number' ? width - RIGHT_MARGIN_PX : null;
}
