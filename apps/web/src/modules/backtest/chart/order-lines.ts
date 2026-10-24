import type { OrderView } from '@trading/backtest';
import { bucketStart, openPnl, signedUsd, type Timeframe } from '@trading/backtest-engine';
import type { IndicatorTemplate } from 'klinecharts';

export const ORDERS_INDICATOR = 'BT_ORDERS';

/** What the chart draws for one order, in bar times of the current timeframe. */
export type OrderMark =
  | {
      kind: 'live';
      from: number;
      entry: number;
      sl: number;
      tp: number;
      pending: boolean;
      long: boolean;
      lots: string;
      /** USD per point per lot, for the open P/L on the entry line. */
      pointValue: string;
    }
  | { kind: 'closed'; from: number; to: number; entry: number; exit: number; win: boolean };

/** Orders of one instrument → marks; times snap to the bar that contains them. */
export function orderMarks(orders: OrderView[], instrument: string, tf: Timeframe, pointValue = '1'): OrderMark[] {
  return orders
    .filter((o) => o.instrument === instrument)
    .flatMap((o): OrderMark[] => {
      if (o.status === 'pending' || o.status === 'open') {
        return [
          {
            kind: 'live',
            from: bucketStart(o.filledAt ?? o.placedAt, tf),
            entry: Number(o.fillPrice ?? o.entry),
            sl: Number(o.sl),
            tp: Number(o.tp),
            pending: o.status === 'pending',
            long: o.side === 'long',
            lots: o.lots,
            pointValue,
          },
        ];
      }
      if (o.status === 'closed' && o.filledAt !== null && o.closedAt !== null) {
        return [
          {
            kind: 'closed',
            from: bucketStart(o.filledAt, tf),
            to: bucketStart(o.closedAt, tf),
            entry: Number(o.fillPrice),
            exit: Number(o.closePrice),
            win: Number(o.net ?? 0) >= 0,
          },
        ];
      }
      return [];
    });
}

const COLOURS = { entry: '#60a5fa', win: '#4ade80', loss: '#f87171' };

/** Simulated orders on the price pane: the entry line for live orders, entry→exit for closed trades. */
export const orderLines: IndicatorTemplate<unknown, unknown, { marks: OrderMark[] }> = {
  name: ORDERS_INDICATOR,
  shortName: 'Orders',
  series: 'price',
  figures: [],
  extendData: { marks: [] },
  calc: (list) => list.map(() => ({})),
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', legends: [], features: [] }),
  draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
    const marks = indicator.extendData?.marks ?? [];
    // The newest bar on the chart is the cursor bar in replay: open P/L is read at its close.
    const close = chart.getDataList().at(-1)?.close;
    const x = (ts: number) => xAxis.convertTimestampToPixel(ts);
    const y = (p: number) => Math.round(yAxis.convertToPixel(p)) + 0.5;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    for (const m of marks) {
      if (m.kind === 'live') {
        const left = Math.max(0, x(m.from));
        // Stop, target and a pending entry are draggable overlays (order-handles.ts); a filled entry stays here.
        if (m.pending) continue;
        const side = `${m.long ? 'Long' : 'Short'} ${m.lots}`;
        const pnl =
          close === undefined
            ? ''
            : ` · ${signedUsd(openPnl({ side: m.long ? 'long' : 'short', fill: String(m.entry), lots: m.lots }, close, m.pointValue))}`;
        const label = `${side}${pnl}`;
        const py = y(m.entry);
        ctx.strokeStyle = COLOURS.entry;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(left, py);
        ctx.lineTo(bounding.width, py);
        ctx.stroke();
        // A tag at the right edge, like the draggable SL/TP labels, so it never runs under the price axis.
        const w = ctx.measureText(label).width + 12;
        const tx = bounding.width - 8 - w;
        ctx.fillStyle = 'rgba(30, 64, 175, 0.92)';
        ctx.fillRect(tx, py - 9, w, 18);
        ctx.fillStyle = '#f9fafb';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, tx + 6, py);
        ctx.textBaseline = 'alphabetic';
      } else {
        const colour = m.win ? COLOURS.win : COLOURS.loss;
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x(m.from), y(m.entry));
        ctx.lineTo(x(m.to), y(m.exit));
        ctx.stroke();
        for (const [ts, p] of [
          [m.from, m.entry],
          [m.to, m.exit],
        ] as const) {
          ctx.beginPath();
          ctx.arc(x(ts), y(p), 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.restore();
    return true;
  },
};
