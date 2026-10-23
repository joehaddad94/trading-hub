'use client';

import type { Drawing, DrawingInput, DrawingPoint, DrawingStyle, DrawingTool } from '@trading/backtest';
import type { Timeframe } from '@trading/backtest-engine';
import type { Chart, Overlay, OverlayCreate, OverlayEvent, OverlayMode, Point } from 'klinecharts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActionResult } from '@/lib/action-result';
import { type DrawingChange, DrawingHistory } from './drawing-history';
import { TOOL_BY_ID } from './tools/registry';
import { overlayName, type ToolData } from './tools/types';

export type DrawingActions = {
  create: (instrument: string, input: unknown) => Promise<ActionResult<Drawing>>;
  update: (id: string, input: unknown) => Promise<ActionResult<void>>;
  remove: (id: string) => Promise<ActionResult<void>>;
  removeAll: (instrument: string) => Promise<ActionResult<number>>;
};

export type DrawingContext = {
  instrument: string;
  pointValue: string;
  priceDigits: number;
  tf: Timeframe;
  /** Account balance for position sizing (backtest session's, M21; 25,000 by default). */
  balance: string;
};

const BASE_STYLE: DrawingStyle = { color: '#60a5fa', width: 1, lock: false };
const PREFIX = 'bt_';

/** Snap drawing points to candle prices (TradingView's magnet): off, weak (near a price) or strong (always). */
export type Magnet = Extract<OverlayMode, 'normal' | 'weak_magnet' | 'strong_magnet'>;
const MAGNETS: Magnet[] = ['normal', 'weak_magnet', 'strong_magnet'];
const MAGNET_KEY = 'backtest.magnet';

function readMagnet(): Magnet {
  try {
    const stored = window.localStorage.getItem(MAGNET_KEY);
    return MAGNETS.find((m) => m === stored) ?? 'normal';
  } catch {
    return 'normal';
  }
}

const toolOf = (overlay: { name: string }) => overlay.name.slice(PREFIX.length) as DrawingTool;
const toPoints = (points: Partial<Point>[]): DrawingPoint[] =>
  points.map((p) => ({ ts: p.timestamp ?? 0, price: p.value ?? 0 }));
const toChart = (points: DrawingPoint[]) => points.map((p) => ({ timestamp: p.ts, value: p.price }));

const inputOf = (o: Overlay<ToolData>): DrawingInput => ({
  tool: toolOf(o),
  points: toPoints(o.points),
  style: o.extendData.style,
  label: o.extendData.label,
});

const inputOfDrawing = (d: DrawingInput): DrawingInput => ({
  tool: d.tool,
  points: d.points,
  style: d.style,
  label: d.label,
});

/** What the e2e tests and the properties panel read: the persisted drawings as the chart holds them. */
export type ShownDrawing = {
  id: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  style: DrawingStyle;
  label: string | null;
};

/**
 * Drawing controller (backtester spec §4): starts tools, completes and saves drawings, mirrors moves and
 * deletes to the DB, and re-creates an instrument's drawings on the chart. Overlays carry their DB id in
 * `extendData`, so timeframe switches (same timestamps, new bars) keep them in place.
 */
export function useDrawings(chart: Chart | null, ctx: DrawingContext, initial: Drawing[], actions: DrawingActions) {
  const store = useRef<Drawing[]>(initial);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [active, setActive] = useState<DrawingTool | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<ShownDrawing[]>([]);
  const shift = useRef(false);
  const suppressRemove = useRef(false);
  const tempAt = useRef(0);
  const history = useRef(new DrawingHistory());
  /** True while undo/redo applies a change, so it isn't recorded again. */
  const applying = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const syncHistory = useCallback(() => {
    setCanUndo(history.current.canUndo);
    setCanRedo(history.current.canRedo);
  }, []);
  const record = useCallback(
    (change: DrawingChange) => {
      if (applying.current) return;
      // A blur or drop that changed nothing isn't a step.
      if (change.kind === 'update' && JSON.stringify(change.before) === JSON.stringify(change.after)) return;
      history.current.record(change);
      syncHistory();
    },
    [syncHistory],
  );
  const [magnet, setMagnetState] = useState<Magnet>('normal');
  /** Ctrl (⌘ on a Mac) held: strong magnet while it is down, as on TradingView. */
  const [held, setHeld] = useState(false);
  const mode: Magnet = held ? 'strong_magnet' : magnet;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  useEffect(() => setMagnetState(readMagnet()), []);
  const setMagnet = useCallback((next: Magnet) => {
    setMagnetState(next);
    try {
      window.localStorage.setItem(MAGNET_KEY, next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      shift.current = e.shiftKey;
      setHeld(e.ctrlKey || e.metaKey);
    };
    const blur = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', down);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', down);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const overlays = useCallback(
    () => (chart ? chart.getOverlays().filter((o) => o.name.startsWith(PREFIX)) : []) as Overlay<ToolData>[],
    [chart],
  );

  const refresh = useCallback(() => {
    setShown(
      overlays()
        .filter((o) => o.extendData?.drawingId)
        .map((o) => ({
          id: o.extendData.drawingId as string,
          tool: toolOf(o),
          points: toPoints(o.points),
          style: o.extendData.style,
          label: o.extendData.label,
        })),
    );
  }, [overlays]);

  const report = useCallback((result: ActionResult<unknown>) => {
    setError(result.ok ? null : result.error);
    return result.ok;
  }, []);

  const data = useCallback(
    (style: DrawingStyle, label: string | null, drawingId: string | null): ToolData => ({
      drawingId,
      style,
      label,
      pointValue: ctxRef.current.pointValue,
      balance: ctxRef.current.balance,
      priceDigits: ctxRef.current.priceDigits,
    }),
    [],
  );

  const removeTemporary = useCallback(() => {
    if (!chart) return;
    for (const o of overlays()) if (o.extendData?.temporary) chart.removeOverlay({ id: o.id });
  }, [chart, overlays]);

  // Handlers read the latest state through refs: overlays keep the functions they were created with.
  const handlers = useRef<
    Pick<OverlayCreate<ToolData>, 'onDrawEnd' | 'onPressedMoveEnd' | 'onRemoved' | 'onSelected' | 'onDeselected'>
  >({});
  handlers.current = {
    onDrawEnd: (event: OverlayEvent<ToolData>) => {
      const o = event.overlay;
      const tool = TOOL_BY_ID[toolOf(o)];
      setActive(null);
      if (!chart || !tool) return;
      let points = toPoints(o.points);
      if (tool.complete) {
        points = tool.complete(points, { tf: ctxRef.current.tf, priceDigits: ctxRef.current.priceDigits });
        chart.overrideOverlay({ id: o.id, points: toChart(points) });
      }
      if (tool.id === 'measure' && !shift.current) {
        chart.overrideOverlay({ id: o.id, extendData: { ...o.extendData, temporary: true } });
        tempAt.current = Date.now();
        return;
      }
      void actions
        .create(ctxRef.current.instrument, {
          tool: tool.id,
          points,
          style: o.extendData.style,
          label: o.extendData.label,
        })
        .then((result) => {
          if (!report(result) || !result.ok) {
            suppressRemove.current = true;
            chart.removeOverlay({ id: o.id });
            suppressRemove.current = false;
            return;
          }
          store.current = [...store.current, result.data];
          chart.overrideOverlay({ id: o.id, extendData: { ...o.extendData, drawingId: result.data.id } });
          record({ kind: 'create', ref: history.current.ref(result.data.id), drawing: result.data });
          refresh();
        });
    },
    onPressedMoveEnd: (event: OverlayEvent<ToolData>) => {
      const o = event.overlay;
      const id = o.extendData?.drawingId;
      if (!id) return;
      const input = inputOf(o);
      const before = store.current.find((d) => d.id === id);
      if (before)
        record({ kind: 'update', ref: history.current.ref(id), before: inputOfDrawing(before), after: input });
      store.current = store.current.map((d) => (d.id === id ? { ...d, ...input } : d));
      void actions.update(id, input).then(report);
      refresh();
    },
    onRemoved: (event: OverlayEvent<ToolData>) => {
      const id = event.overlay.extendData?.drawingId;
      setSelected((s) => (s === event.overlay.id ? null : s));
      if (!id || suppressRemove.current) return;
      const gone = store.current.find((d) => d.id === id);
      if (gone) record({ kind: 'remove', ref: history.current.ref(id), drawing: gone });
      store.current = store.current.filter((d) => d.id !== id);
      void actions.remove(id).then(report);
      // onRemoved fires before KLineCharts drops the overlay from its list.
      queueMicrotask(refresh);
    },
    onSelected: (event: OverlayEvent<ToolData>) => setSelected(event.overlay.id),
    onDeselected: (event: OverlayEvent<ToolData>) => setSelected((s) => (s === event.overlay.id ? null : s)),
  };

  const events = useCallback(
    (): Pick<
      OverlayCreate<ToolData>,
      'onDrawEnd' | 'onPressedMoveEnd' | 'onRemoved' | 'onSelected' | 'onDeselected'
    > => ({
      onDrawEnd: (e) => handlers.current.onDrawEnd?.(e),
      onPressedMoveEnd: (e) => handlers.current.onPressedMoveEnd?.(e),
      onRemoved: (e) => handlers.current.onRemoved?.(e),
      onSelected: (e) => handlers.current.onSelected?.(e),
      onDeselected: (e) => handlers.current.onDeselected?.(e),
    }),
    [],
  );

  const draw = useCallback(
    (d: Drawing) => {
      chart?.createOverlay({
        name: overlayName(d.tool),
        points: toChart(d.points),
        lock: d.style.lock,
        visible: !hiddenRef.current,
        mode: modeRef.current,
        extendData: data(d.style, d.label, d.id),
        ...events(),
      } as OverlayCreate);
    },
    [chart, data, events],
  );

  // Re-create the instrument's drawings whenever the chart or instrument changes.
  useEffect(() => {
    if (!chart) return;
    suppressRemove.current = true;
    for (const o of overlays()) chart.removeOverlay({ id: o.id });
    suppressRemove.current = false;
    for (const d of store.current.filter((x) => x.instrument === ctx.instrument)) draw(d);
    // Undo works per instrument, like the drawings it changes.
    history.current.clear();
    syncHistory();
    setSelected(null);
    refresh();
  }, [chart, ctx.instrument, draw, refresh, overlays, syncHistory]);

  useEffect(() => {
    if (!chart) return;
    for (const o of overlays()) chart.overrideOverlay({ id: o.id, visible: !hidden });
  }, [chart, hidden, overlays]);

  useEffect(() => {
    if (!chart) return;
    for (const o of overlays()) chart.overrideOverlay({ id: o.id, mode });
  }, [chart, mode, overlays]);

  const overlayFor = useCallback(
    (drawingId: string) => overlays().find((o) => o.extendData?.drawingId === drawingId) ?? null,
    [overlays],
  );

  /** Applies one undo/redo change to the chart and the database. Returns false when the server refused. */
  const apply = useCallback(
    async (change: DrawingChange): Promise<boolean> => {
      if (!chart) return false;
      if (change.kind === 'batch') {
        for (const c of change.changes) if (!(await apply(c))) return false;
        return true;
      }
      if (change.kind === 'create') {
        const result = await actions.create(change.drawing.instrument, inputOfDrawing(change.drawing));
        if (!report(result) || !result.ok) return false;
        history.current.rename(change.ref, result.data.id);
        store.current = [...store.current, result.data];
        if (result.data.instrument === ctxRef.current.instrument) draw(result.data);
        return true;
      }
      if (change.kind === 'remove') {
        const o = overlayFor(change.ref.id);
        if (o) {
          suppressRemove.current = true;
          chart.removeOverlay({ id: o.id });
          suppressRemove.current = false;
        }
        store.current = store.current.filter((d) => d.id !== change.ref.id);
        return report(await actions.remove(change.ref.id));
      }
      const o = overlayFor(change.ref.id);
      const next = change.after;
      if (o) {
        chart.overrideOverlay({
          id: o.id,
          points: toChart(next.points),
          lock: next.style.lock,
          extendData: { ...o.extendData, style: next.style, label: next.label },
        });
      }
      store.current = store.current.map((d) => (d.id === change.ref.id ? { ...d, ...next } : d));
      return report(await actions.update(change.ref.id, next));
    },
    [chart, actions, report, draw, overlayFor],
  );

  const busy = useRef(false);
  const travel = useCallback(
    async (direction: 'undo' | 'redo') => {
      if (busy.current) return;
      const change = direction === 'undo' ? history.current.undo() : history.current.redo();
      if (!change) return;
      busy.current = true;
      applying.current = true;
      try {
        await apply(change);
      } finally {
        applying.current = false;
        busy.current = false;
        setSelected(null);
        syncHistory();
        refresh();
      }
    },
    [apply, syncHistory, refresh],
  );
  const undo = useCallback(() => void travel('undo'), [travel]);
  const redo = useCallback(() => void travel('redo'), [travel]);

  const start = useCallback(
    (tool: DrawingTool) => {
      if (!chart) return;
      removeTemporary();
      const module = TOOL_BY_ID[tool];
      setActive(tool);
      setHidden(false);
      // Hide the properties bar while drawing: on a phone it covers much of the chart.
      setSelected(null);
      chart.createOverlay({
        name: overlayName(tool),
        mode: modeRef.current,
        extendData: data({ ...BASE_STYLE, ...module.defaults }, null, null),
        ...events(),
      } as OverlayCreate);
    },
    [chart, data, events, removeTemporary],
  );

  const restyle = useCallback(
    (overlayId: string, change: { style?: Partial<DrawingStyle>; label?: string | null }) => {
      if (!chart) return;
      const o = overlays().find((x) => x.id === overlayId);
      if (!o) return;
      const style = { ...o.extendData.style, ...change.style };
      const label = change.label === undefined ? o.extendData.label : change.label;
      chart.overrideOverlay({ id: o.id, lock: style.lock, extendData: { ...o.extendData, style, label } });
      const id = o.extendData.drawingId;
      if (id) {
        const input = { ...inputOf(o), style, label };
        const before = store.current.find((d) => d.id === id);
        if (before)
          record({ kind: 'update', ref: history.current.ref(id), before: inputOfDrawing(before), after: input });
        store.current = store.current.map((d) => (d.id === id ? { ...d, ...input } : d));
        void actions.update(id, input).then(report);
      }
      refresh();
    },
    [chart, overlays, actions, report, refresh, record],
  );

  const removeSelected = useCallback(() => {
    if (chart && selected) chart.removeOverlay({ id: selected });
  }, [chart, selected]);

  const removeAll = useCallback(async () => {
    if (!chart) return;
    const result = await actions.removeAll(ctx.instrument);
    if (!report(result)) return;
    const gone = store.current.filter((d) => d.instrument === ctx.instrument);
    if (gone.length > 0) {
      record({
        kind: 'batch',
        changes: gone.map((d) => ({ kind: 'remove', ref: history.current.ref(d.id), drawing: d })),
      });
    }
    store.current = store.current.filter((d) => d.instrument !== ctx.instrument);
    suppressRemove.current = true;
    for (const o of overlays()) chart.removeOverlay({ id: o.id });
    suppressRemove.current = false;
    setSelected(null);
    refresh();
  }, [chart, actions, ctx.instrument, report, refresh, overlays, record]);

  /** A plain chart click clears a temporary measure (not the click that just finished it). */
  const onChartClick = useCallback(() => {
    if (Date.now() - tempAt.current > 300) removeTemporary();
  }, [removeTemporary]);

  const selectedOverlay = selected ? (overlays().find((o) => o.id === selected) ?? null) : null;

  return {
    active,
    start,
    cancel: () => {
      if (chart && active) {
        for (const o of overlays())
          if (!o.extendData?.drawingId && !o.extendData?.temporary) chart.removeOverlay({ id: o.id });
      }
      setActive(null);
    },
    selected: selectedOverlay
      ? {
          id: selectedOverlay.id,
          drawingId: selectedOverlay.extendData.drawingId,
          tool: toolOf(selectedOverlay),
          points: toPoints(selectedOverlay.points),
          style: selectedOverlay.extendData.style,
          label: selectedOverlay.extendData.label,
        }
      : null,
    restyle,
    removeSelected,
    removeAll,
    hidden,
    setHidden,
    error,
    shown,
    onChartClick,
    undo,
    redo,
    canUndo,
    canRedo,
    magnet,
    setMagnet,
  };
}
