import { INDICATOR_BY_ID } from '@trading/indicators';
import { describe, expect, it } from 'vitest';
import { activeIndicators, indicatorTemplate, normalisePrefs } from './indicators';

describe('indicator prefs', () => {
  it('fills defaults and drops junk', () => {
    const prefs = normalisePrefs({ rsi: { on: true, color: 'red', settings: { length: 7 } }, other: { on: true } });
    expect(prefs.atr).toEqual({ on: false, color: '#facc15', settings: { length: 14 } });
    expect(prefs.rsi).toEqual({ on: true, color: '#a78bfa', settings: { length: 7, overbought: 70, oversold: 30 } });
    expect(activeIndicators(prefs).map((a) => a.id)).toEqual(['rsi']);
    expect(normalisePrefs('nope').rsi?.on).toBe(false);
  });
});

describe('indicator template', () => {
  it('maps nulls to empty points and reports the newest value', () => {
    const def = INDICATOR_BY_ID.atr;
    if (!def) throw new Error('missing atr');
    const t = indicatorTemplate(def);
    let last: number | null = null;
    const bars = [
      { timestamp: 1, open: 1, high: 2, low: 1, close: 1.5 },
      { timestamp: 2, open: 1.5, high: 3, low: 1, close: 2 },
    ];
    const out = t.calc(bars, {
      extendData: { settings: { length: 2 }, color: '#fff', onResult: (v: number | null) => (last = v) },
    } as never) as { v?: number }[];
    expect(out).toEqual([{}, { v: 1.5 }]);
    expect(last).toBe(1.5);
    expect(t.minValue).toBeNull();
    expect(indicatorTemplate(INDICATOR_BY_ID.rsi as never).maxValue).toBe(100);
  });
});
