import { afterEach, describe, expect, it } from 'vitest';
import { chartPalette, INK, ink, setChartTheme } from './chart-theme';

afterEach(() => setChartTheme('dark'));

describe('chart theme', () => {
  it('swaps the palette with the app theme', () => {
    setChartTheme('light');
    expect(chartPalette().title).toBe('#131722');
    setChartTheme('dark');
    expect(chartPalette().title).toBe('#d1d4dc');
  });

  it('white ink turns dark on the light pane only; other colours pass through', () => {
    expect(ink(INK)).toBe(INK);
    setChartTheme('light');
    expect(ink(INK)).toBe('#131722');
    expect(ink('#60a5fa')).toBe('#60a5fa');
  });
});
