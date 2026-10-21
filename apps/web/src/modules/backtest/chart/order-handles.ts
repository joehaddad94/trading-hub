'use client';

import type { OrderView } from '@trading/backtest';
import Decimal from 'decimal.js';
import type { Chart, OverlayCreate, OverlayEvent, OverlayTemplate } from 'klinecharts';
import { useEffect, useRef, useState } from 'react';

export const ORDER_LEVEL_OVERLAY = 'ord_level';

type Level = 'sl' | 'tp';

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
};

const COLOUR: Record<Level, string> = { sl: '#f87171', tp: '#4ade80' };
const LABEL_BG: Record<Level, string> = { sl: 'rgba(153, 27, 27, 0.92)', tp: 'rgba(22, 101, 52, 0.92)' };

/** Money at `price` if the order exits there: (price − entry) × direction × lots × point value. */
export function pnlAt(data: Pick<LevelData, 'entry' | 'long' | 'lots' | 'pointValue'>, price: number): string {
  const diff = new Decimal(price).minus(data.entry);
  return diff
    .times(data.long ? 1 : -1)
    .times(data.lots)
    .times(data.pointValue)
    .toFixed(2);
}

/** Label on a stop/target line, e.g. "SL 42,100.00 · −$250.00". */
export function levelLabel(data: LevelData, price: number): string {
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
        styles: { color: COLOUR[data.level], size: 1, style: 'dashed', dashedValue: [6, 4] },
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

/**
 * Keeps one draggable SL and TP line per live order of the shown instrument. Lines follow the orders as replay
 * moves them; a line being dragged is left alone; a rejected move snaps the line back to the saved level.
 */
export function useOrderHandles(opts: {
  chart: Chart | null;
  orders: OrderView[];
  instrument: { code: string; pointValue: string; priceDigits: number };
  /** False outside replay: levels can only change at a cursor. */
  editable: boolean;
  onMove: (orderId: string, sl: string, tp: string) => Promise<unknown>;
}) {
  const { chart, orders, instrument, editable, onMove } = opts;
  const ids = useRef(new Map<string, string>());
  const dragging = useRef<string | null>(null);
  const ordersRef = useRef(orders);
  ordersRef.current = orders;
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  // Bumped after a move settles, so a rejected move re-syncs the line to the saved level.
  const [revision, setRevision] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision forces a re-sync after a rejected move.
  useEffect(() => {
    if (!chart) return;
    const live = orders.filter(
      (o) => o.instrument === instrument.code && (o.status === 'open' || o.status === 'pending'),
    );
    const wanted = new Set<string>();
    for (const o of live) {
      for (const level of ['sl', 'tp'] as const) {
        const key = keyOf(o.id, level);
        wanted.add(key);
        if (dragging.current === key) continue;
        const data: LevelData = {
          orderId: o.id,
          level,
          entry: o.fillPrice ?? o.entry,
          long: o.side === 'long',
          lots: o.lots,
          pointValue: instrument.pointValue,
          priceDigits: instrument.priceDigits,
        };
        const point = { timestamp: o.filledAt ?? o.placedAt, value: Number(level === 'sl' ? o.sl : o.tp) };
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
          onPressedMoveStart: () => {
            dragging.current = key;
          },
          onPressedMoveEnd: (event: OverlayEvent<LevelData>) => {
            dragging.current = null;
            const order = ordersRef.current.find((x) => x.id === o.id);
            const price = event.overlay.points[0]?.value;
            if (!order || price === undefined) return;
            const value = price.toFixed(instrument.priceDigits);
            const sl = level === 'sl' ? value : order.sl;
            const tp = level === 'tp' ? value : order.tp;
            void moveRef.current(order.id, sl, tp).finally(() => setRevision((r) => r + 1));
          },
        } as OverlayCreate) as string | null;
        if (id) ids.current.set(key, id);
      }
    }
    for (const [key, id] of ids.current) {
      if (wanted.has(key)) continue;
      chart.removeOverlay({ id });
      ids.current.delete(key);
    }
  }, [chart, orders, instrument.code, instrument.pointValue, instrument.priceDigits, editable, revision]);

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
