'use client';

import type { OrderView } from '@trading/backtest';
import Decimal from 'decimal.js';
import type { Chart, OverlayCreate, OverlayEvent, OverlayTemplate } from 'klinecharts';
import { useCallback, useEffect, useRef, useState } from 'react';

export const ORDER_LEVEL_OVERLAY = 'ord_level';

/** Stop, target, and a pending order's entry. */
type Level = 'sl' | 'tp' | 'entry';

/** What a draggable stop/target line knows about its order. */
export type LevelData = {
  orderId: string;
  level: Level;
  /** Fill price for an open order, entry for a pending one. */
  entry: string;
  long: boolean;
  lots: string;
  pointValue: string;
  priceDigits: number;
  /** Entry line text instead of "Entry", e.g. "Buy limit 0.27" on the order ticket's preview. */
  title?: string;
};

/** The order ticket's preview (not yet an order): its entry, stop and target as draggable lines. */
export type DraftLines = {
  long: boolean;
  entry: number;
  sl: number;
  tp: number;
  lots: string;
  /** Where the lines are anchored in time: the replay cursor. */
  at: number;
  title: string;
};

/** Key prefix of the ticket preview's lines (orders use their id). */
export const DRAFT_ID = 'draft';

const COLOUR: Record<Level, string> = { sl: '#f87171', tp: '#4ade80', entry: '#60a5fa' };
const LABEL_BG: Record<Level, string> = {
  sl: 'rgba(153, 27, 27, 0.92)',
  tp: 'rgba(22, 101, 52, 0.92)',
  entry: 'rgba(30, 64, 175, 0.92)',
};
/** Class on the chart root while the pointer is on a line: an up/down cursor, as on TradingView. */
export const RESIZE_CLASS = 'chart-ns-resize';

/** Money at `price` if the order exits there: (price − entry) × direction × lots × point value. */
export function pnlAt(data: Pick<LevelData, 'entry' | 'long' | 'lots' | 'pointValue'>, price: number): string {
  const diff = new Decimal(price).minus(data.entry);
  return diff
    .times(data.long ? 1 : -1)
    .times(data.lots)
    .times(data.pointValue)
    .toFixed(2);
}

/** Label on a line, e.g. "SL 42100.00 · −$250.00" or "Entry 42010.00 · 0.50 lots". */
export function levelLabel(data: LevelData, price: number): string {
  if (data.level === 'entry') {
    return data.title
      ? `${data.title} · ${price.toFixed(data.priceDigits)}`
      : `Entry ${price.toFixed(data.priceDigits)} · ${data.lots} lots`;
  }
  const pnl = pnlAt(data, price);
  const money = pnl.startsWith('-') ? `−$${pnl.slice(1)}` : `+$${pnl}`;
  return `${data.level.toUpperCase()} ${price.toFixed(data.priceDigits)} · ${money}`;
}

/**
 * A live order's stop or target as a full-width line you drag up or down, TradingView-style. One point;
 * only its price matters. Dropping it saves the new level (spec §6: modify SL/TP during replay).
 */
export const orderLevelOverlay: OverlayTemplate<LevelData> = {
  name: ORDER_LEVEL_OVERLAY,
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, bounding, overlay }) => {
    const y = coordinates[0]?.y;
    const price = overlay.points[0]?.value;
    const data = overlay.extendData;
    if (y === undefined || price === undefined || !data) return [];
    return [
      {
        type: 'line',
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        // The ticket preview is solid; placed orders are dashed.
        styles:
          data.orderId === DRAFT_ID
            ? { color: COLOUR[data.level], size: 1, style: 'solid' }
            : { color: COLOUR[data.level], size: 1, style: 'dashed', dashedValue: [6, 4] },
      },
      // A wider invisible band so the thin line is easy to grab, also on touch.
      {
        type: 'rect',
        attrs: { x: 0, y: y - 6, width: bounding.width, height: 12 },
        styles: { style: 'fill', color: 'rgba(0, 0, 0, 0)' },
      },
      {
        type: 'text',
        attrs: { x: bounding.width - 8, y, text: levelLabel(data, price), align: 'right', baseline: 'middle' },
        styles: {
          color: '#f9fafb',
          backgroundColor: LABEL_BG[data.level],
          size: 11,
          paddingLeft: 6,
          paddingRight: 6,
          paddingTop: 3,
          paddingBottom: 3,
          borderRadius: 3,
        },
      },
    ];
  },
};

const keyOf = (orderId: string, level: Level) => `${orderId}:${level}`;

/** New levels after dragging one line: the others keep their saved values. */
export function movedLevels(
  order: Pick<OrderView, 'sl' | 'tp' | 'entry' | 'status'>,
  level: Level,
  value: string,
): { sl: string; tp: string; entry?: string } {
  return {
    sl: level === 'sl' ? value : order.sl,
    tp: level === 'tp' ? value : order.tp,
    ...(level === 'entry' && order.status === 'pending' ? { entry: value } : {}),
  };
}

/**
 * Keeps one draggable SL and TP line per live order of the shown instrument, plus the entry of a pending one.
 * Lines follow the orders as replay moves them; a line being dragged is left alone; a rejected move snaps the
 * line back to the saved level.
 */
export function useOrderHandles(opts: {
  chart: Chart | null;
  orders: OrderView[];
  instrument: { code: string; pointValue: string; priceDigits: number };
  /** False outside replay: levels can only change at a cursor. */
  editable: boolean;
  onMove: (orderId: string, levels: { sl: string; tp: string; entry?: string }) => Promise<unknown>;
  /** The order ticket's preview; its lines move the ticket, not an order. */
  draft?: DraftLines | null;
  onDraftMove?: (level: Level, price: number) => void;
}) {
  const { chart, orders, instrument, editable, onMove, draft = null } = opts;
  const draftMoveRef = useRef(opts.onDraftMove);
  draftMoveRef.current = opts.onDraftMove;
  const ids = useRef(new Map<string, string>());
  const dragging = useRef<string | null>(null);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  // Bumped after a move settles, so a rejected move re-syncs the line to the saved level.
  const [revision, setRevision] = useState(0);
  const hover = useRef(false);
  const setResize = useCallback(() => {
    chart?.getDom()?.classList.toggle(RESIZE_CLASS, hover.current || dragging.current !== null);
  }, [chart]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision forces a re-sync after a rejected move.
  useEffect(() => {
    if (!chart) return;
    const live = orders.filter(
      (o) => o.instrument === instrument.code && (o.status === 'open' || o.status === 'pending'),
    );
    type Spec = { key: string; level: Level; data: LevelData; point: { timestamp: number; value: number } };
    const specs: Spec[] = live.flatMap((o) => {
      // A market order waiting for the next open has an entry nobody can move: only its stop and target show.
      const levels: Level[] = o.status === 'pending' && o.type !== 'market' ? ['entry', 'sl', 'tp'] : ['sl', 'tp'];
      return levels.map((level) => ({
        key: keyOf(o.id, level),
        level,
        data: {
          orderId: o.id,
          level,
          entry: o.fillPrice ?? o.entry,
          long: o.side === 'long',
          lots: o.lots,
          pointValue: instrument.pointValue,
          priceDigits: instrument.priceDigits,
        },
        point: { timestamp: o.filledAt ?? o.placedAt, value: Number(o[level]) },
      }));
    });
    if (draft) {
      for (const level of ['entry', 'sl', 'tp'] as const) {
        specs.push({
          key: keyOf(DRAFT_ID, level),
          level,
          data: {
            orderId: DRAFT_ID,
            level,
            entry: String(draft.entry),
            long: draft.long,
            lots: draft.lots,
            pointValue: instrument.pointValue,
            priceDigits: instrument.priceDigits,
            title: draft.title,
          },
          point: { timestamp: draft.at, value: draft[level] },
        });
      }
    }
    const wanted = new Set<string>();
    for (const { key, level, data, point } of specs) {
      const { orderId } = data;
      wanted.add(key);
      if (dragging.current === key) continue;
      const existing = ids.current.get(key);
      if (existing && chart.getOverlays({ id: existing }).length > 0) {
        chart.overrideOverlay({ id: existing, points: [point], extendData: data, lock: !editable });
        continue;
      }
      const id = chart.createOverlay({
        name: ORDER_LEVEL_OVERLAY,
        points: [point],
        lock: !editable,
        extendData: data,
        zLevel: 10,
        onMouseEnter: () => {
          hover.current = true;
          setResize();
        },
        onMouseLeave: () => {
          hover.current = false;
          setResize();
        },
        onPressedMoveStart: () => {
          dragging.current = key;
          setResize();
        },
        onPressedMoveEnd: (event: OverlayEvent<LevelData>) => {
          dragging.current = null;
          setResize();
          const price = event.overlay.points[0]?.value;
          if (price === undefined) return;
          if (orderId === DRAFT_ID) {
            draftMoveRef.current?.(level, Number(price.toFixed(instrument.priceDigits)));
            setRevision((r) => r + 1);
            return;
          }
          const order = ordersRef.current.find((x) => x.id === orderId);
          if (!order) return;
          const levels = movedLevels(order, level, price.toFixed(instrument.priceDigits));
          void moveRef.current(order.id, levels).finally(() => setRevision((r) => r + 1));
        },
      } as OverlayCreate) as string | null;
      if (id) ids.current.set(key, id);
    }
    for (const [key, id] of ids.current) {
      if (wanted.has(key)) continue;
      chart.removeOverlay({ id });
      ids.current.delete(key);
    }
    // For the e2e tests: each line's price and pixel row on the chart.
    const lines = [...ids.current].flatMap(([key, id]) => {
      const point = chart.getOverlays({ id })[0]?.points[0];
      if (point?.value === undefined) return [];
      const px = chart.convertToPixel(point, { paneId: 'candle_pane' }) as { y?: number };
      return [{ key, price: point.value, y: px.y ?? null }];
    });
    chart.getDom()?.setAttribute('data-order-lines', JSON.stringify(lines));
  }, [
    chart,
    orders,
    draft,
    instrument.code,
    instrument.pointValue,
    instrument.priceDigits,
    editable,
    revision,
    setResize,
  ]);

  // Unmount: take the lines off the chart.
  useEffect(
    () => () => {
      if (!chart) return;
      for (const id of ids.current.values()) chart.removeOverlay({ id });
      ids.current.clear();
    },
    [chart],
  );
}
