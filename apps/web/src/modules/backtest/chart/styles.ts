import type { DeepPartial, Styles } from 'klinecharts';

/** Dark theme only (tech-architecture.md §1); up/down use the app's profit/loss hues. */
const UP = '#22c55e';
const DOWN = '#f87171';
const GRID = 'rgba(255, 255, 255, 0.06)';
const TEXT = 'rgba(229, 231, 235, 0.7)';

export const chartStyles: DeepPartial<Styles> = {
  grid: { horizontal: { color: GRID }, vertical: { color: GRID } },
  candle: {
    bar: {
      upColor: UP,
      downColor: DOWN,
      noChangeColor: TEXT,
      upBorderColor: UP,
      downBorderColor: DOWN,
      upWickColor: UP,
      downWickColor: DOWN,
    },
    priceMark: { last: { upColor: UP, downColor: DOWN } },
    tooltip: { title: { show: false } },
  },
  xAxis: { axisLine: { color: GRID }, tickText: { color: TEXT } },
  yAxis: { axisLine: { color: GRID }, tickText: { color: TEXT } },
  separator: { color: GRID },
  crosshair: {
    horizontal: { text: { backgroundColor: '#374151' } },
    vertical: { text: { backgroundColor: '#374151' } },
  },
};
