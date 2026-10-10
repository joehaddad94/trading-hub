import { describe, expect, it } from 'vitest';
import { longTool, shortTool } from './position';
import { TOOLS, toolForKey } from './registry';
import { extendLine } from './trend';
import { hexToRgba } from './types';

describe('tool registry', () => {
  it('maps Alt shortcuts to tools', () => {
    expect(TOOLS.map((t) => t.id)).toEqual(['horizontal', 'trend', 'long', 'short', 'measure']);
    expect(toolForKey('KeyL')?.id).toBe('long');
    expect(toolForKey('KeyX')).toBeNull();
  });

  it('places a new position from one click', () => {
    const entry = { ts: Date.parse('2026-10-07T14:30:00Z'), price: 46000 };
    expect(longTool.complete?.([entry], { tf: 5, priceDigits: 2 })).toEqual([
      entry,
      { ts: entry.ts + 100 * 60_000, price: 45954 },
      { ts: entry.ts + 100 * 60_000, price: 46092 },
    ]);
    expect(shortTool.complete?.([entry], { tf: 1, priceDigits: 2 })?.map((p) => p.price)).toEqual([
      46000, 46046, 45908,
    ]);
  });

  it('extends trend lines to the pane edges', () => {
    const a = { x: 10, y: 100 };
    const b = { x: 20, y: 90 };
    expect(extendLine(a, b, 100, 'none')).toEqual([a, b]);
    expect(extendLine(a, b, 100, 'right')).toEqual([a, { x: 100, y: 10 }]);
    expect(extendLine(b, a, 100, 'both')).toEqual([
      { x: 0, y: 110 },
      { x: 100, y: 10 },
    ]);
    expect(extendLine(a, { x: 10, y: 0 }, 100, 'both')).toEqual([a, { x: 10, y: 0 }]);
  });

  it('converts colours for fills', () => {
    expect(hexToRgba('#a78bfa', 0.5)).toBe('rgba(167, 139, 250, 0.5)');
  });
});
