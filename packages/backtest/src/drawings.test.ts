import { describe, expect, it } from 'vitest';
import { drawingInputSchema } from './drawings';

describe('drawingInputSchema', () => {
  it('fills style defaults and checks the point count per tool', () => {
    const ok = drawingInputSchema.parse({ tool: 'horizontal', points: [{ ts: 1, price: 46000.5 }], style: {} });
    expect(ok).toEqual({
      tool: 'horizontal',
      points: [{ ts: 1, price: 46000.5 }],
      style: { color: '#60a5fa', width: 1, lock: false },
      label: null,
    });
    expect(drawingInputSchema.safeParse({ tool: 'long', points: [{ ts: 1, price: 1 }], style: {} }).success).toBe(
      false,
    );
    expect(
      drawingInputSchema.safeParse({
        tool: 'trend',
        points: [
          { ts: 1, price: 1 },
          { ts: 2, price: -1 },
        ],
        style: {},
      }).success,
    ).toBe(false);
    expect(
      drawingInputSchema.safeParse({
        tool: 'long',
        points: [
          { ts: 1, price: 3 },
          { ts: 2, price: 2 },
          { ts: 2, price: 5 },
        ],
        style: { sizing: { mode: 'risk_pct', value: '0.5' }, script: 'x' },
      }).success,
    ).toBe(false);
  });
});
