import { ATR_DEFAULTS, type AtrSettings, atr } from './atr';
import type { Ohlc, Series } from './core';
import { RSI_DEFAULTS, type RsiSettings, rsi } from './rsi';

/** A numeric setting shown in the indicator's settings dialog. */
export type IndicatorField = { key: string; label: string; min: number; max: number; step: number };

/** Indicator registry (backtester spec §5): add an entry here and the chart picks it up. */
export type IndicatorDefinition<S extends Record<string, number> = Record<string, number>> = {
  id: string;
  label: string;
  defaults: S;
  fields: IndicatorField[];
  /** Fixed scale for the pane (RSI 0–100), or null to fit the data. */
  range: { min: number; max: number } | null;
  /** Horizontal guide lines, read from the settings (RSI 70 / 30). */
  guides: (settings: S) => number[];
  calc: (bars: Ohlc[], settings: S) => Series;
};

const atrDef: IndicatorDefinition<AtrSettings> = {
  id: 'atr',
  label: 'ATR',
  defaults: ATR_DEFAULTS,
  fields: [{ key: 'length', label: 'Length', min: 1, max: 500, step: 1 }],
  range: null,
  guides: () => [],
  calc: (bars, s) => atr(bars, s),
};

const rsiDef: IndicatorDefinition<RsiSettings> = {
  id: 'rsi',
  label: 'RSI',
  defaults: RSI_DEFAULTS,
  fields: [
    { key: 'length', label: 'Length', min: 1, max: 500, step: 1 },
    { key: 'overbought', label: 'Upper level', min: 1, max: 99, step: 1 },
    { key: 'oversold', label: 'Lower level', min: 1, max: 99, step: 1 },
  ],
  range: { min: 0, max: 100 },
  guides: (s) => [s.overbought, s.oversold],
  calc: (bars, s) =>
    rsi(
      bars.map((b) => b.close),
      s,
    ),
};

export const INDICATORS = [atrDef, rsiDef] as unknown as IndicatorDefinition[];

export const INDICATOR_BY_ID: Record<string, IndicatorDefinition> = Object.fromEntries(
  INDICATORS.map((d) => [d.id, d]),
);

/**
 * Settings from storage or a form, clamped to each field's range and rounded to its step; unknown or
 * invalid values fall back to the defaults.
 */
export function normaliseSettings(def: IndicatorDefinition, raw: unknown): Record<string, number> {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, number> = { ...def.defaults };
  for (const f of def.fields) {
    const v = Number(source[f.key]);
    if (!Number.isFinite(v)) continue;
    out[f.key] = Math.min(f.max, Math.max(f.min, Math.round(v / f.step) * f.step));
  }
  return out;
}
