import { overlayName, type ToolModule } from './types';

type Pt = { x: number; y: number };

/** Extends segment a→b to the pane edges as asked. */
export function extendLine(a: Pt, b: Pt, width: number, extend: 'none' | 'left' | 'right' | 'both'): [Pt, Pt] {
  if (extend === 'none' || a.x === b.x) return [a, b];
  const slope = (b.y - a.y) / (b.x - a.x);
  const at = (x: number) => ({ x, y: a.y + slope * (x - a.x) });
  const [left, right] = a.x < b.x ? [a, b] : [b, a];
  return [
    extend === 'left' || extend === 'both' ? at(0) : left,
    extend === 'right' || extend === 'both' ? at(width) : right,
  ];
}

/** Trend line: two anchors, optional extension left/right/both. */
export const trendTool: ToolModule = {
  id: 'trend',
  label: 'Trend line',
  key: 'KeyT',
  defaults: { extend: 'none' },
  overlay: {
    name: overlayName('trend'),
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, bounding, overlay }) => {
      const [a, b] = coordinates;
      if (!a || !b) return [];
      const { style } = overlay.extendData;
      return [
        {
          type: 'line',
          attrs: { coordinates: extendLine(a, b, bounding.width, style.extend ?? 'none') },
          styles: { color: style.color, size: style.width },
        },
      ];
    },
  },
};
