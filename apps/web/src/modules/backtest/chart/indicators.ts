import { INDICATORS, type IndicatorDefinition, normaliseSettings } from '@trading/indicators';
import type { IndicatorTemplate } from 'klinecharts';

/** One indicator as the chart shows it: settings are normalised, colour is a hex swatch. */
export type ActiveIndicator = { id: string; settings: Record<string, number>; color: string };

export type IndicatorPrefs = Record<string, { on: boolean; color: string; settings: Record<string, number> }>;

export const INDICATOR_COLOURS = ['#facc15', '#a78bfa', '#60a5fa', '#f87171', '#4ade80', '#f9fafb'];
const DEFAULT_COLOUR: Record<string, string> = { atr: '#facc15', rsi: '#a78bfa' };

export const indicatorName = (id: string) => `BT_${id.toUpperCase()}`;
export const indicatorPane = (id: string) => `pane_${id}`;

export type IndicatorExtend = {
  settings: Record<string, number>;
  color: string;
  /** Called with the newest value after each calculation (exposed to tests as a data attribute). */
  onResult?: ((last: number | null) => void) | undefined;
};

type Value = { v?: number };

/** KLineCharts template for a registry indicator: our own maths (TradingView formulas), one line, guides. */
export function indicatorTemplate(def: IndicatorDefinition): IndicatorTemplate<Value, number, IndicatorExtend> {
  return {
    name: indicatorName(def.id),
    shortName: def.label,
    series: 'normal',
    precision: 2,
    calcParams: def.fields.map((f) => def.defaults[f.key] as number),
    minValue: def.range?.min ?? null,
    maxValue: def.range?.max ?? null,
    figures: [
      {
        key: 'v',
        title: `${def.label}: `,
        type: 'line',
        styles: ({ indicator }) => ({
          color: (indicator.extendData as IndicatorExtend | undefined)?.color ?? '#facc15',
        }),
      },
    ],
    // Only bars already on the chart exist here (never past the replay cursor), forming candle included.
    calc: (list, indicator) => {
      const settings = indicator.extendData?.settings ?? def.defaults;
      const out = def.calc(list, settings);
      indicator.extendData?.onResult?.(out.at(-1) ?? null);
      return out.map((v) => (v === null ? {} : { v }));
    },
    draw: ({ ctx, indicator, bounding, yAxis }) => {
      const settings = indicator.extendData?.settings ?? def.defaults;
      const guides = def.guides(settings);
      if (guides.length === 0) return false;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 1;
      for (const g of guides) {
        const y = Math.round(yAxis.convertToPixel(g)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(bounding.width, y);
        ctx.stroke();
      }
      ctx.restore();
      // false: KLineCharts still draws the line figure on top.
      return false;
    },
  };
}

export const INDICATOR_TEMPLATES = INDICATORS.map(indicatorTemplate);

/** Prefs from storage, with every registry indicator present and its settings valid. */
export function normalisePrefs(raw: unknown): IndicatorPrefs {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, Record<string, unknown> | undefined>) : {};
  const out: IndicatorPrefs = {};
  for (const def of INDICATORS) {
    const item = source[def.id];
    const color = typeof item?.color === 'string' && INDICATOR_COLOURS.includes(item.color) ? item.color : null;
    out[def.id] = {
      on: item?.on === true,
      color: color ?? DEFAULT_COLOUR[def.id] ?? INDICATOR_COLOURS[0] ?? '#facc15',
      settings: normaliseSettings(def, item?.settings),
    };
  }
  return out;
}

export function activeIndicators(prefs: IndicatorPrefs): ActiveIndicator[] {
  return INDICATORS.flatMap((def) => {
    const p = prefs[def.id];
    return p?.on ? [{ id: def.id, settings: p.settings, color: p.color }] : [];
  });
}
