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

/** KLineCharts' default bar width (px), what a reset goes back to. */
export const DEFAULT_BAR_SPACE = 10;

/**
 * The price axes of the candle pane as KLineCharts keeps them. The auto-scale flag isn't in the typings, so it is
 * read and set through these optional methods (the library is pinned to an exact version).
 */
type AutoScaleAxis = { getAutoCalcTickFlag?: () => boolean; setAutoCalcTickFlag?: (on: boolean) => void };
const priceAxes = (chart: Chart) => chart.getYAxes({ paneId: 'candle_pane' }) as unknown as AutoScaleAxis[];

/** True while the price axis fits the candles on screen (TradingView's "Auto"). */
export function isAutoScale(chart: Chart): boolean {
  return priceAxes(chart).every((axis) => axis.getAutoCalcTickFlag?.() ?? true);
}

/** Turns auto scale back on, as a double-click on the price axis does. */
export function setAutoScale(chart: Chart): void {
  for (const axis of priceAxes(chart)) axis.setAutoCalcTickFlag?.(true);
  // Rebuilds the axis ticks from the candles on screen.
  chart.overrideYAxis({ paneId: 'candle_pane' });
}

/** Whether the newest bar is on screen, i.e. "back to latest" has nothing to do. */
export function isAtLatest(range: { realTo: number }, count: number): boolean {
  return count === 0 || range.realTo >= count;
}

/** TradingView's Alt+R: default bar width and right margin, auto scale, newest bar in view. */
export function resetView(chart: Chart): void {
  chart.setBarSpace(DEFAULT_BAR_SPACE);
  chart.setOffsetRightDistance(RIGHT_MARGIN_PX);
  setAutoScale(chart);
  chart.scrollToRealTime();
}

/** Moves a pointer less than this between press and release and it is a click; more and it was a drag. */
export const CLICK_SLOP_PX = 5;

/** A press and release count as a click (not the end of a pan) when the pointer barely moved. */
export function isClick(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= CLICK_SLOP_PX;
}

/**
 * Phones, as on TradingView: a drag always pans and a long press shows the crosshair; a tap only hides it.
 * KLineCharts shows the crosshair on any tap and then turns the next drag near it into a crosshair move, so its
 * tap handler is wrapped to clear that state after the tap has reached the drawings.
 */
type TouchEvents = {
  tapEvent?: (e: unknown) => boolean;
  _touchCoordinate?: unknown;
  _touchCancelCrosshair?: boolean;
};
type ChartInternals = {
  _chartEvent?: TouchEvents;
  getChartStore?: () => { setCrosshair: (c?: unknown) => void };
};
export function crosshairOnLongPressOnly(chart: Chart): void {
  const internals = chart as unknown as ChartInternals;
  const events = internals._chartEvent;
  const original = events?.tapEvent;
  if (!events || typeof original !== 'function' || typeof internals.getChartStore !== 'function') return;
  events.tapEvent = (e: unknown) => {
    const consumed = original.call(events, e);
    events._touchCoordinate = null;
    events._touchCancelCrosshair = false;
    internals.getChartStore?.().setCrosshair(undefined);
    return consumed;
  };
}
