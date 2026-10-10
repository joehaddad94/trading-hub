import type { DrawingPoint } from '@trading/backtest';
import { defaultLevels, MINUTE_MS, positionMetrics, type Side } from '@trading/backtest-engine';
import type { OverlayFigure } from 'klinecharts';
import { overlayName, type ToolModule } from './types';

/** Default stop distance for a new position: 0.1% of price (≈46 points on US30, ≈24 on NAS100). */
export const DEFAULT_STOP_SHARE = 0.001;
/** A new position box spans this many bars. */
const DEFAULT_WIDTH_BARS = 20;

const PROFIT = 'rgba(34, 197, 94, 0.18)';
const LOSS = 'rgba(248, 113, 113, 0.18)';

function positionTool(side: Side): ToolModule {
  return {
    id: side,
    label: side === 'long' ? 'Long position' : 'Short position',
    key: side === 'long' ? 'KeyL' : 'KeyS',
    defaults: { sizing: { mode: 'risk_pct', value: '0.5' } },
    complete: (points, { tf, priceDigits }) => {
      const [entry] = points as [DrawingPoint];
      const step = 10 ** -priceDigits;
      const distance = Math.max(step, Math.round((entry.price * DEFAULT_STOP_SHARE) / step) * step);
      const { stop, target } = defaultLevels(side, entry.price, distance);
      const end = entry.ts + DEFAULT_WIDTH_BARS * tf * MINUTE_MS;
      return [entry, { ts: end, price: stop }, { ts: end, price: target }];
    },
    overlay: {
      name: overlayName(side),
      totalStep: 2,
      needDefaultPointFigure: true,
      needDefaultXAxisFigure: false,
      needDefaultYAxisFigure: true,
      // Stop and target share the box's right edge.
      performEventPressedMove: ({ points, performPointIndex, performPoint }) => {
        if (performPointIndex === 0 || points.length < 3) return;
        const other = points[performPointIndex === 1 ? 2 : 1];
        if (other) {
          if (performPoint.timestamp !== undefined) other.timestamp = performPoint.timestamp;
          if (performPoint.dataIndex !== undefined) other.dataIndex = performPoint.dataIndex;
        }
      },
      createPointFigures: ({ coordinates, overlay }) => {
        const [e, s, t] = coordinates;
        const [pe, ps, pt] = overlay.points;
        if (!e || !s || !t || pe?.value === undefined || ps?.value === undefined || pt?.value === undefined) return [];
        const { style, pointValue, balance, priceDigits } = overlay.extendData;
        const m = positionMetrics({
          side,
          entry: pe.value,
          stop: ps.value,
          target: pt.value,
          pointValue,
          balance,
          sizing: style.sizing ?? { mode: 'risk_pct', value: '0.5' },
        });
        const x = Math.min(e.x, s.x);
        const width = Math.max(Math.abs(s.x - e.x), 8);
        const text = (y: number, value: string, baseline: CanvasTextBaseline, color: string): OverlayFigure => ({
          type: 'text',
          ignoreEvent: true,
          attrs: { x: x + width / 2, y, text: value, align: 'center', baseline },
          styles: {
            color: '#f9fafb',
            backgroundColor: color,
            size: 11,
            paddingLeft: 4,
            paddingRight: 4,
            paddingTop: 2,
            paddingBottom: 2,
            borderRadius: 2,
          },
        });
        const fmt = (v: number) => v.toFixed(priceDigits);
        const upper = Math.min(s.y, t.y);
        const lower = Math.max(s.y, t.y);
        const targetAbove = t.y < s.y;
        return [
          {
            type: 'rect',
            attrs: { x, y: Math.min(e.y, t.y), width, height: Math.abs(t.y - e.y) },
            styles: { style: 'fill', color: PROFIT },
          },
          {
            type: 'rect',
            attrs: { x, y: Math.min(e.y, s.y), width, height: Math.abs(s.y - e.y) },
            styles: { style: 'fill', color: LOSS },
          },
          {
            type: 'line',
            attrs: {
              coordinates: [
                { x, y: e.y },
                { x: x + width, y: e.y },
              ],
            },
            styles: { color: style.color, size: style.width },
          },
          text(
            targetAbove ? upper - 4 : lower + 4,
            `Target ${fmt(pt.value)} · ${m.tpPoints} pts · $${m.rewardUsd}`,
            targetAbove ? 'bottom' : 'top',
            'rgba(22, 101, 52, 0.9)',
          ),
          text(
            targetAbove ? lower + 4 : upper - 4,
            `Stop ${fmt(ps.value)} · ${m.slPoints} pts · $${m.riskUsd}`,
            targetAbove ? 'top' : 'bottom',
            'rgba(153, 27, 27, 0.9)',
          ),
          text(
            e.y,
            m.valid ? `RR 1:${m.rr} · ${m.lots} lots · ${m.riskPct}%` : 'Stop on the wrong side',
            'middle',
            'rgba(31, 41, 55, 0.9)',
          ),
        ];
      },
    },
  };
}

export const longTool = positionTool('long');
export const shortTool = positionTool('short');
