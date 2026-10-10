import { formatSpan, measure } from '@trading/backtest-engine';
import { hexToRgba, overlayName, type ToolModule } from './types';

/** Measure: click-drag between two points; temporary unless Shift is held (spec §4). */
export const measureTool: ToolModule = {
  id: 'measure',
  label: 'Measure',
  key: 'KeyM',
  defaults: { color: '#a78bfa' },
  overlay: {
    name: overlayName('measure'),
    totalStep: 3,
    needDefaultPointFigure: true,
    needDefaultXAxisFigure: true,
    needDefaultYAxisFigure: true,
    createPointFigures: ({ coordinates, overlay }) => {
      const [a, b] = coordinates;
      const [pa, pb] = overlay.points;
      if (!a || !b || pa?.value === undefined || pb?.value === undefined) return [];
      const { style } = overlay.extendData;
      const bars = Math.abs((pb.dataIndex ?? 0) - (pa.dataIndex ?? 0));
      const m = measure({ ts: pa.timestamp ?? 0, price: pa.value }, { ts: pb.timestamp ?? 0, price: pb.value }, bars);
      const up = pb.value >= pa.value;
      return [
        {
          type: 'rect',
          attrs: {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            width: Math.abs(b.x - a.x),
            height: Math.abs(b.y - a.y),
          },
          styles: { style: 'fill', color: hexToRgba(style.color, 0.15) },
        },
        {
          type: 'text',
          ignoreEvent: true,
          attrs: {
            x: (a.x + b.x) / 2,
            y: up ? Math.min(a.y, b.y) - 4 : Math.max(a.y, b.y) + 4,
            text: `${up ? '+' : ''}${m.points} (${m.pct}%) · ${m.bars} bars · ${formatSpan(m.ms)}`,
            align: 'center',
            baseline: up ? 'bottom' : 'top',
          },
          styles: {
            color: '#f9fafb',
            backgroundColor: hexToRgba(style.color, 0.85),
            size: 11,
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 2,
          },
        },
      ];
    },
  },
};
