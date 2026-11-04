/**
 * Canvas colours for the backtest chart, per app theme (TradingView's light and dark panes). KLineCharts draws on
 * a canvas, so CSS tokens can't reach it: kline-chart.tsx sets the active palette when the theme changes and
 * re-applies the styles, and every custom indicator or overlay reads `chartPalette()` while drawing.
 */
export type ChartPalette = {
  up: string;
  down: string;
  grid: string;
  text: string;
  title: string;
  muted: string;
  crosshair: string;
  label: string;
  labelText: string;
  separator: string;
  /** Kill-zone names along the bottom of the pane. */
  sessionText: string;
  /** Dashed guide lines (RSI 30/70 and the like). */
  guide: string;
  /** Order lines: entry, and exits that won or lost. */
  order: { entry: string; win: string; loss: string };
};

const DARK: ChartPalette = {
  up: '#089981',
  down: '#f23645',
  grid: 'rgba(42, 46, 57, 0.6)',
  text: '#b2b5be',
  title: '#d1d4dc',
  muted: '#787b86',
  crosshair: '#9598a1',
  label: '#4c525e',
  labelText: '#ffffff',
  separator: '#2a2e39',
  sessionText: 'rgba(229, 231, 235, 0.55)',
  guide: 'rgba(148, 163, 184, 0.6)',
  order: { entry: '#60a5fa', win: '#4ade80', loss: '#f87171' },
};

const LIGHT: ChartPalette = {
  up: '#089981',
  down: '#f23645',
  grid: 'rgba(224, 227, 235, 0.7)',
  text: '#131722',
  title: '#131722',
  muted: '#6a6d78',
  crosshair: '#9598a1',
  label: '#131722',
  labelText: '#ffffff',
  separator: '#e0e3eb',
  sessionText: 'rgba(19, 23, 34, 0.5)',
  guide: 'rgba(100, 116, 139, 0.6)',
  order: { entry: '#2962ff', win: '#089981', loss: '#f23645' },
};

/**
 * The "white" swatch stored on drawings and indicators. It means "high contrast ink", so on the light pane it
 * draws near-black instead of vanishing. Stored values never change, so switching back restores white.
 */
export const INK = '#f9fafb';
const INK_ON_LIGHT = '#131722';

let current: ChartPalette = DARK;

export function setChartTheme(theme: 'light' | 'dark') {
  current = theme === 'light' ? LIGHT : DARK;
}

export const chartPalette = (): ChartPalette => current;

/** A stored drawing or indicator colour as it should be drawn on the current pane. */
export const ink = (colour: string): string => (colour === INK && current === LIGHT ? INK_ON_LIGHT : colour);
