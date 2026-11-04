import type { OrderView } from '@trading/backtest';
import { bucketStart, openPnl, signedUsd, type Timeframe } from '@trading/backtest-engine';
import Decimal from 'decimal.js';
import type { Chart, IndicatorTemplate } from 'klinecharts';
import { chartPalette } from './chart-theme';
import { hexToRgba } from './tools/types';

export const ORDERS_INDICATOR = 'BT_ORDERS';

/** What the chart draws for one order, in bar times of the current timeframe. */
export type OrderMark =
  | {
      kind: 'live';
      /** Order id (the ticket preview uses DRAFT_ID): a dragged line moves its box at once. */
      id: string;
      from: number;
      entry: number;
      sl: number;
      tp: number;
      pending: boolean;
      long: boolean;
      lots: string;
      /** USD per point per lot, for the open P/L on the entry line. */
      pointValue: string;
      /** The order ticket's preview: a box with no entry line or P/L. */
      draft?: boolean;
    }
  | {
      kind: 'closed';
      id: string;
      from: number;
      to: number;
      entry: number;
      exit: number;
      win: boolean;
      sl: number;
      tp: number;
      long: boolean;
      /**
       * False for a part closed off a position (spec §6, "Part"): the rest of the position draws the one box, so
       * the closed part only shows its exit.
       */
      box: boolean;
      /** "+$120.50 · 1.20R" at the exit. */
      result: string;
    };

/** Pieces of one position share side, fill price and fill time (a partial close splits the order in two). */
const familyKey = (o: OrderView) => `${o.instrument}|${o.side}|${o.fillPrice}|${o.filledAt}`;

/** How long a filled order lasts, for picking which piece of a split position draws the box. */
const endOf = (o: OrderView) => (o.status === 'open' ? Number.POSITIVE_INFINITY : (o.closedAt ?? 0));

/**
 * "+$120.50 · 1.20R" for a whole position: the parts of a split one add up (R = total net ÷ total risk), so a
 * partly closed trade shows one result at its box instead of a tag per part.
 */
function resultText(parts: OrderView[]): string {
  if (parts.length === 0 || parts.some((o) => o.net === null)) return '';
  let net = new Decimal(0);
  let risk: Decimal | null = new Decimal(0);
  for (const o of parts) {
    net = net.plus(o.net ?? 0);
    risk =
      risk && o.r !== null && !new Decimal(o.r).isZero() ? risk.plus(new Decimal(o.net ?? 0).dividedBy(o.r)) : null;
  }
  const text = signedUsd(net.toFixed(2));
  return risk && !risk.isZero() ? `${text} · ${net.dividedBy(risk).toFixed(2)}R` : text;
}

/**
 * Orders of one instrument → marks; times snap to the bar that contains them. Every trade is a long/short box
 * (Joe, 4 Nov 2026): a live one runs from its fill to the chart's right edge, a closed one stops at its exit.
 */
export function orderMarks(orders: OrderView[], instrument: string, tf: Timeframe, pointValue = '1'): OrderMark[] {
  const shown = orders.filter((o) => o.instrument === instrument);
  // The piece of each split position that lasts longest draws its box.
  const owner = new Map<string, OrderView>();
  const family = new Map<string, OrderView[]>();
  for (const o of shown) {
    if (o.filledAt === null || (o.status !== 'open' && o.status !== 'closed')) continue;
    const key = familyKey(o);
    family.set(key, [...(family.get(key) ?? []), o]);
    const best = owner.get(key);
    if (!best || endOf(o) > endOf(best) || (endOf(o) === endOf(best) && o.id < best.id)) owner.set(key, o);
  }
  return shown.flatMap((o): OrderMark[] => {
    if (o.status === 'pending' || o.status === 'open') {
      return [
        {
          kind: 'live',
          id: o.id,
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
          id: o.id,
          from: bucketStart(o.filledAt, tf),
          to: bucketStart(o.closedAt, tf),
          entry: Number(o.fillPrice),
          exit: Number(o.closePrice),
          win: Number(o.net ?? 0) >= 0,
          sl: Number(o.sl),
          tp: Number(o.tp),
          long: o.side === 'long',
          box: owner.get(familyKey(o))?.id === o.id,
          // Only the box's owner carries the result; while part of the position is open, no result yet.
          result: owner.get(familyKey(o))?.id === o.id ? resultText(family.get(familyKey(o)) ?? [o]) : '',
        },
      ];
    }
    return [];
  });
}

/** A line being dragged: its order's box follows it before the move is saved. */
export type LevelPreview = { id: string; level: 'entry' | 'sl' | 'tp'; price: number };

/** Marks with a dragged line's price applied. */
export function withPreview(marks: OrderMark[], preview: LevelPreview | null | undefined): OrderMark[] {
  if (!preview) return marks;
  return marks.map((m) =>
    m.kind === 'live' && m.id === preview.id && (preview.level !== 'entry' || m.pending)
      ? { ...m, [preview.level]: preview.price }
      : m,
  );
}

type OrdersData = { marks: OrderMark[]; preview?: LevelPreview | null };

/**
 * Moves a dragged line's box on the chart while the line moves (no React render per pointer move). `null`
 * clears it; the next orders update replaces the marks anyway.
 */
export function previewLevel(chart: Chart, preview: LevelPreview | null) {
  const indicator = chart.getIndicators({ name: ORDERS_INDICATOR })[0];
  if (!indicator) return;
  const data = (indicator.extendData ?? { marks: [] }) as OrdersData;
  chart.overrideIndicator({ name: ORDERS_INDICATOR, extendData: { ...data, preview } });
}

/** Translucent box fills, readable on the light and dark panes. */
const fills = (m: OrderMark) => {
  const { order } = chartPalette();
  // A pending order is fainter until it fills; the ticket's preview sits in between.
  const alpha = m.kind === 'closed' ? 0.12 : m.draft ? 0.11 : m.pending ? 0.07 : 0.16;
  return { profit: hexToRgba(order.win, alpha), loss: hexToRgba(order.loss, alpha) };
};

/** Simulated orders on the price pane: the entry line for live orders, entry→exit for closed trades. */
export const orderLines: IndicatorTemplate<unknown, unknown, OrdersData> = {
  name: ORDERS_INDICATOR,
  shortName: 'Orders',
  series: 'price',
  figures: [],
  extendData: { marks: [] },
  calc: (list) => list.map(() => ({})),
  createTooltipDataSource: () => ({ name: '', calcParamsText: '', legends: [], features: [] }),
  draw: ({ ctx, chart, indicator, bounding, xAxis, yAxis }) => {
    const marks = withPreview(indicator.extendData?.marks ?? [], indicator.extendData?.preview);
    // The newest bar on the chart is the cursor bar in replay: open P/L is read at its close.
    const close = chart.getDataList().at(-1)?.close;
    const x = (ts: number) => xAxis.convertTimestampToPixel(ts);
    const y = (p: number) => Math.round(yAxis.convertToPixel(p)) + 0.5;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = '11px sans-serif';
    // Boxes first, under every line and label: profit zone entry→target, loss zone entry→stop.
    const drawn: { id: string; closed: boolean; left: number; right: number; sl: number; tp: number }[] = [];
    for (const m of marks) {
      if (m.kind === 'closed' && !m.box) continue;
      // Edge to edge of the candles it spans, so a trade in and out within one bar still shows.
      const half = chart.getBarSpace().halfBar;
      const left = Math.max(0, x(m.from) - half);
      const right = m.kind === 'closed' ? x(m.to) + half : bounding.width;
      if (right <= 0 || left >= bounding.width) continue;
      const fill = fills(m);
      drawn.push({ id: m.id, closed: m.kind === 'closed', left, right, sl: y(m.sl), tp: y(m.tp) });
      const ye = y(m.entry);
      for (const [level, colour] of [
        [m.tp, fill.profit],
        [m.sl, fill.loss],
      ] as const) {
        const yl = y(level);
        ctx.fillStyle = colour;
        ctx.fillRect(left, Math.min(ye, yl), right - left, Math.abs(yl - ye));
      }
      if (m.kind === 'closed') {
        // A frozen box keeps its edges: the stop and target it had when it closed.
        const { order } = chartPalette();
        for (const [level, colour] of [
          [m.tp, order.win],
          [m.sl, order.loss],
        ] as const) {
          ctx.strokeStyle = hexToRgba(colour, 0.5);
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(left, y(level));
          ctx.lineTo(right, y(level));
          ctx.stroke();
        }
      }
    }
    for (const m of marks) {
      if (m.kind === 'live') {
        const left = Math.max(0, x(m.from));
        // Stop, target and a pending entry are draggable overlays (order-handles.ts); a filled entry stays here.
        if (m.pending || m.draft) continue;
        const side = `${m.long ? 'Long' : 'Short'} ${m.lots}`;
        const pnl =
          close === undefined
            ? ''
            : ` · ${signedUsd(openPnl({ side: m.long ? 'long' : 'short', fill: String(m.entry), lots: m.lots }, close, m.pointValue))}`;
        const label = `${side}${pnl}`;
        const py = y(m.entry);
        ctx.strokeStyle = chartPalette().order.entry;
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
        const colour = m.win ? chartPalette().order.win : chartPalette().order.loss;
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
        if (m.result) {
          // The result sits just right of the exit, on the box's exit side.
          const w = ctx.measureText(m.result).width + 10;
          const tx = Math.min(x(m.to) + 6, bounding.width - w - 2);
          const ty = y(m.exit);
          ctx.fillStyle = hexToRgba(colour, 0.9);
          ctx.fillRect(tx, ty - 8, w, 16);
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(m.result, tx + 5, ty);
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
    ctx.restore();
    // For the e2e tests: each box's pixel edges, so they can check the box sits on the stop and target lines.
    const dom = chart.getDom();
    const report = JSON.stringify(drawn.map((b) => ({ ...b, left: Math.round(b.left), right: Math.round(b.right) })));
    if (dom && dom.getAttribute('data-order-boxes') !== report) dom.setAttribute('data-order-boxes', report);
    return true;
  },
};
