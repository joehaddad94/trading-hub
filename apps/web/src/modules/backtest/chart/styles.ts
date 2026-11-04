import type { DeepPartial, KLineData, NeighborData, Nullable, Styles, TooltipLegend } from 'klinecharts';
import { chartPalette } from './chart-theme';

/**
 * TradingView-style chart pane (design spec): TradingView's light or dark pane (chart-theme.ts), candle colours,
 * crosshair and "O H L C change" legend, on our own KLineCharts chart.
 */
const FONT = 'Geist, -apple-system, "Segoe UI", Roboto, sans-serif';

const fmt = (v: number, digits: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** "US30 · 5m   O … H … L … C … +x (+y%)", coloured by the bar's direction like TradingView's legend. */
function legend(label: string, digits: number) {
  return ({ current, prev }: NeighborData<Nullable<KLineData>>): TooltipLegend[] => {
    const TV = chartPalette();
    if (!current) return [{ title: '', value: { text: label, color: TV.text } }];
    const colour = current.close >= current.open ? TV.up : TV.down;
    const base = prev?.close ?? current.open;
    const change = current.close - base;
    const pct = base ? (change / base) * 100 : 0;
    const sign = change > 0 ? '+' : '';
    const v = (text: string) => ({ text, color: colour });
    return [
      { title: '', value: { text: `${label}  `, color: TV.title } },
      { title: { text: 'O ', color: TV.muted }, value: v(fmt(current.open, digits)) },
      { title: { text: 'H ', color: TV.muted }, value: v(fmt(current.high, digits)) },
      { title: { text: 'L ', color: TV.muted }, value: v(fmt(current.low, digits)) },
      { title: { text: 'C ', color: TV.muted }, value: v(fmt(current.close, digits)) },
      { title: '', value: v(`${sign}${fmt(change, digits)} (${sign}${pct.toFixed(2)}%)`) },
    ];
  };
}

/** Built from the active palette: call again (and setStyles) after the theme changes. */
export function chartStyles({ label, digits }: { label: string; digits: number }): DeepPartial<Styles> {
  const TV = chartPalette();
  const axisText = { color: TV.text, size: 11, family: FONT };
  const crossText = { backgroundColor: TV.label, borderColor: TV.label, color: TV.labelText, family: FONT, size: 11 };
  const crossLine = { color: TV.crosshair, style: 'dashed' as const, dashedValue: [4, 4], size: 1 };
  return {
    grid: { horizontal: { color: TV.grid }, vertical: { color: TV.grid } },
    candle: {
      bar: {
        upColor: TV.up,
        downColor: TV.down,
        noChangeColor: TV.text,
        upBorderColor: TV.up,
        downBorderColor: TV.down,
        noChangeBorderColor: TV.text,
        upWickColor: TV.up,
        downWickColor: TV.down,
        noChangeWickColor: TV.text,
      },
      priceMark: {
        high: { color: TV.text, textFamily: FONT },
        low: { color: TV.text, textFamily: FONT },
        last: {
          upColor: TV.up,
          downColor: TV.down,
          line: { style: 'dashed', dashedValue: [2, 2], size: 1 },
          text: { family: FONT, size: 11 },
        },
      },
      tooltip: {
        title: { show: false },
        legend: { template: legend(label, digits), family: FONT, size: 12, marginLeft: 8, marginTop: 8 },
      },
    },
    xAxis: { axisLine: { color: TV.grid }, tickLine: { color: TV.grid }, tickText: axisText },
    yAxis: { axisLine: { color: TV.grid }, tickLine: { color: TV.grid }, tickText: axisText },
    separator: { color: TV.separator },
    crosshair: {
      horizontal: { line: crossLine, text: crossText },
      vertical: { line: crossLine, text: crossText },
    },
  };
}
