'use client';

import { type Bar, MINUTE_MS, type Timeframe } from '@trading/backtest-engine';
import { INDICATORS } from '@trading/indicators';
import type { Chart, DataLoaderGetBarsParams, KLineData, Point } from 'klinecharts';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { type ActiveIndicator, INDICATOR_TEMPLATES, indicatorName, indicatorPane } from './indicators';
import { BARS_PAGE, fetchBars, liveUntil, toKLine } from './loader';
import { type Marker, NEWS_INDICATOR, newsMarkers } from './news-markers';
import { ORDER_LEVEL_OVERLAY, orderLevelOverlay } from './order-handles';
import { ORDERS_INDICATOR, type OrderMark, orderLines } from './order-lines';
import { SESSION_INDICATOR, sessionShading } from './session-shading';
import { chartStyles } from './styles';
import { TOOLS } from './tools/registry';
import { barX, keepViewShift, rightLimit } from './view';

const PAGE = BARS_PAGE;
/** Bars kept to the right of the anchor when a timeframe switch reloads around it. */
const RIGHT_OF_ANCHOR = 60;

/** What the workspace can do with a mounted chart (replay pushes bars through it). */
export type ChartApi = {
  /** Upserts bars at the right edge: a bar with the last bar's time replaces it, a newer one is appended. */
  upsert(bars: Bar[]): void;
  lastBar(): Bar | null;
  /** Every bar on the chart, oldest first. */
  bars(): Bar[];
  /**
   * Replaces the chart's bars with `bars` (already on the client, so no request): stepping back drops the
   * newest bars without reloading the window.
   */
  rewind(bars: Bar[]): void;
  /** The KLineCharts instance, for the drawing controller. */
  chart: Chart;
};

export type ChartProps = {
  instrument: { code: string; priceDigits: number };
  tf: Timeframe;
  timezone: string;
  sessions: boolean;
  /** Replay cursor (1m open time) or null for live data. Read at load time; never fetch past it. */
  cursorRef: RefObject<number | null>;
  /** Bump to reload around the cursor (replay start/jump/exit). */
  reloadKey: number;
  onReady?: (api: ChartApi | null) => void;
  /** Called with the bar under the pointer when the chart is clicked. */
  onBarClick?: (barStart: number) => void;
  /** Called on right-click with the bar under the pointer and the pointer position relative to the chart. */
  onBarContextMenu?: (barStart: number, at: { x: number; y: number }) => void;
  /** News markers (one per bar); empty hides them. */
  markers?: Marker[];
  /** Bar under the crosshair, or null when the pointer leaves. */
  onCrosshair?: (barStart: number | null) => void;
  /** Indicators shown in their own panes below the price chart. */
  indicators?: ActiveIndicator[];
  /** Simulated orders and trades of this instrument. */
  orderMarks?: OrderMark[];
};

/** For the e2e tests: where the newest bar sits on screen, to check that replay keeps the view. */
function markLastX(chart: Chart, node: HTMLElement | null) {
  const last = chart.getDataList().at(-1);
  const x = last ? barX(chart, last.timestamp) : null;
  node?.setAttribute('data-last-x', x === null ? '' : x.toFixed(1));
}

/** Height of an indicator pane in px: smaller when the chart is short (phones), so prices keep most room. */
const indicatorPaneHeight = (chartHeight: number) => (chartHeight < 520 ? 70 : 110);

type Klinecharts = typeof import('klinecharts');

const toBar = (k: KLineData): Bar => ({
  ts: k.timestamp,
  open: k.open,
  high: k.high,
  low: k.low,
  close: k.close,
  volume: k.volume ?? 0,
});

/** Open time of the bar at pixel `x` of the candle pane, or null. */
function barAt(chart: Chart, x: number): number | null {
  const [point] = chart.convertFromPixel([{ x, y: 0 }], { paneId: 'candle_pane' }) as Partial<Point>[];
  const index = point?.dataIndex;
  return index === undefined ? null : (chart.getDataList()[index]?.timestamp ?? null);
}

/**
 * KLineCharts adapter (backtester spec §2–3). Loads candles lazily through `/api/backtest/candles` with
 * `until` = replay cursor (or now); switching instrument or timeframe reloads around the bar at the right
 * edge of the view, so the time range is kept.
 */
export function KLineChart(props: ChartProps) {
  const {
    instrument,
    tf,
    timezone,
    sessions,
    cursorRef,
    reloadKey,
    onReady,
    onBarClick,
    onBarContextMenu,
    markers,
    onCrosshair,
    indicators,
    orderMarks,
  } = props;
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const anchorRef = useRef<number | null>(null);
  const pushRef = useRef<((bar: KLineData) => void) | null>(null);
  const clickRef = useRef(onBarClick);
  clickRef.current = onBarClick;
  const menuRef = useRef(onBarContextMenu);
  menuRef.current = onBarContextMenu;
  const crosshairRef = useRef(onCrosshair);
  crosshairRef.current = onCrosshair;
  const generation = useRef(0);
  /** Bars the next 'init' load uses instead of fetching (set by `rewind`). */
  const localRef = useRef<{ bars: Bar[]; keep: { ts: number; x: number } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** 'init' while a switch or replay jump reloads the window; 'page' while older bars load on scroll. */
  const [loading, setLoading] = useState<'init' | 'page' | null>('init');
  const [lastBar, setLastBar] = useState<Bar | null>(null);

  // The chart is created once; prop changes are applied by the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone and styles are applied by their own effects.
  useEffect(() => {
    let disposed = false;
    let lib: Klinecharts | null = null;
    let observer: ResizeObserver | null = null;
    const node = el.current;
    const onLeave = () => crosshairRef.current?.(null);
    const onClick = (event: MouseEvent) => {
      const chart = chartRef.current;
      if (!chart || !node || !clickRef.current) return;
      const ts = barAt(chart, event.clientX - node.getBoundingClientRect().left);
      if (ts !== null) clickRef.current(ts);
    };
    const onMenu = (event: MouseEvent) => {
      const chart = chartRef.current;
      if (!chart || !node || !menuRef.current) return;
      const box = node.getBoundingClientRect();
      const ts = barAt(chart, event.clientX - box.left);
      if (ts === null) return;
      event.preventDefault();
      menuRef.current(ts, { x: event.clientX - box.left, y: event.clientY - box.top });
    };
    void import('klinecharts').then((k) => {
      if (disposed || !node) return;
      lib = k;
      if (!k.getSupportedIndicators().includes(SESSION_INDICATOR)) k.registerIndicator(sessionShading);
      if (!k.getSupportedIndicators().includes(NEWS_INDICATOR)) k.registerIndicator(newsMarkers);
      if (!k.getSupportedIndicators().includes(ORDERS_INDICATOR)) k.registerIndicator(orderLines);
      for (const t of INDICATOR_TEMPLATES) if (!k.getSupportedIndicators().includes(t.name)) k.registerIndicator(t);
      const overlays = k.getSupportedOverlays();
      for (const tool of TOOLS) if (!overlays.includes(tool.overlay.name)) k.registerOverlay(tool.overlay);
      if (!overlays.includes(ORDER_LEVEL_OVERLAY)) k.registerOverlay(orderLevelOverlay);
      const chart = k.init(node, {
        styles: chartStyles({ label: `${instrument.code} · ${tf}m`, digits: instrument.priceDigits }),
        timezone,
      });
      if (!chart) return;
      chartRef.current = chart;
      chart.subscribeAction('onCrosshairChange', (data) => {
        // The payload is the pointer position only; map it to the bar like a click.
        const x = (data as { x?: number } | undefined)?.x;
        crosshairRef.current?.(typeof x === 'number' ? barAt(chart, x) : null);
      });
      node.addEventListener('click', onClick, true);
      node.addEventListener('contextmenu', onMenu);
      node.addEventListener('mouseleave', onLeave);
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(node);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      node?.removeEventListener('click', onClick, true);
      node?.removeEventListener('contextmenu', onMenu);
      node?.removeEventListener('mouseleave', onLeave);
      if (lib && node) lib.dispose(node);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    const sync = () => {
      const last = chart.getDataList().at(-1);
      setLastBar(last ? toBar(last) : null);
      markLastX(chart, el.current);
    };
    const api: ChartApi = {
      upsert: (bars) => {
        // Stay where the user scrolled or zoomed to: measure the last bar, add the new ones, scroll back.
        const last = chart.getDataList().at(-1);
        const before = last ? barX(chart, last.timestamp) : null;
        for (const bar of bars) pushRef.current?.(toKLine(bar));
        const newest = chart.getDataList().at(-1);
        const after = last ? barX(chart, last.timestamp) : null;
        const newestX = newest ? barX(chart, newest.timestamp) : null;
        const limit = rightLimit(chart);
        if (before !== null && after !== null && newestX !== null && limit !== null) {
          const shift = keepViewShift({ before, after, newest: newestX, limit });
          if (shift !== 0) chart.scrollByDistance(shift);
        }
        sync();
      },
      lastBar: () => {
        const last = chart.getDataList().at(-1);
        return last ? toBar(last) : null;
      },
      bars: () => chart.getDataList().map(toBar),
      rewind: (bars) => {
        // The last bar kept stays at the same x, so stepping back never moves the view.
        const ref = bars.at(-1);
        const x = ref ? barX(chart, ref.ts) : null;
        localRef.current = { bars, keep: ref && x !== null ? { ts: ref.ts, x } : null };
        chart.resetData();
      },
      chart,
    };
    onReady?.(api);
    return () => onReady?.(null);
  }, [ready, onReady]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey forces a reload around the cursor.
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    const list = chart.getDataList();
    const range = chart.getVisibleRange();
    const cursor = cursorRef.current;
    // Keep the visible time range: the bar at the right edge, unless the view is at the newest bar.
    // A replay (re)start anchors on the cursor itself.
    anchorRef.current =
      cursor === null && list.length > 0 && range.realTo < list.length
        ? (list[range.realTo - 1]?.timestamp ?? null)
        : null;
    const gen = ++generation.current;
    setError(null);
    setLoading('init');
    const syncLast = () => {
      const last = chart.getDataList().at(-1);
      setLastBar(last ? toBar(last) : null);
      markLastX(chart, el.current);
    };
    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }: DataLoaderGetBarsParams) => {
        const until = cursorRef.current === null ? liveUntil(Date.now()) : new Date(cursorRef.current);
        const anchor = anchorRef.current;
        try {
          const local = localRef.current;
          if (type === 'init' && local) {
            localRef.current = null;
            callback(local.bars.map(toKLine), { forward: true, backward: false });
            const x = local.keep ? barX(chart, local.keep.ts) : null;
            if (local.keep && x !== null && x !== local.keep.x) chart.scrollByDistance(local.keep.x - x);
            syncLast();
            setLoading(null);
          } else if (type === 'init') {
            const before = anchor ? new Date(anchor + RIGHT_OF_ANCHOR * tf * MINUTE_MS) : undefined;
            const page = await fetchBars({ instrument: instrument.code, tf, until, before, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore, backward: Boolean(anchor) });
            if (anchor) chart.scrollToTimestamp(anchor);
            syncLast();
            setLoading(null);
          } else if (type === 'forward' && timestamp) {
            setLoading('page');
            const page = await fetchBars({
              instrument: instrument.code,
              tf,
              until,
              before: new Date(timestamp),
              count: PAGE,
            });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore });
            setLoading(null);
          } else if (type === 'backward' && timestamp) {
            setLoading('page');
            const after = new Date(timestamp + tf * MINUTE_MS);
            const page = await fetchBars({ instrument: instrument.code, tf, until, after, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { backward: page.hasMore });
            syncLast();
            setLoading(null);
          } else {
            callback([], false);
          }
        } catch (e) {
          if (gen !== generation.current) return;
          setError((e as Error).message);
          setLoading(null);
          callback([], false);
        }
      },
      subscribeBar: ({ callback }) => {
        pushRef.current = callback;
      },
      unsubscribeBar: () => {
        pushRef.current = null;
      },
    });
    chart.setSymbol({ ticker: instrument.code, pricePrecision: instrument.priceDigits, volumePrecision: 2 });
    chart.setPeriod({ type: 'minute', span: tf });
  }, [ready, instrument.code, instrument.priceDigits, tf, reloadKey, cursorRef]);

  useEffect(() => {
    if (ready) chartRef.current?.setTimezone(timezone);
  }, [ready, timezone]);

  useEffect(() => {
    if (ready)
      chartRef.current?.setStyles(
        chartStyles({ label: `${instrument.code} · ${tf}m`, digits: instrument.priceDigits }),
      );
  }, [ready, instrument.code, instrument.priceDigits, tf]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    if (sessions) {
      if (chart.getIndicators({ name: SESSION_INDICATOR }).length === 0) {
        chart.createIndicator({ name: SESSION_INDICATOR, paneId: 'candle_pane' }, true);
      }
    } else {
      chart.removeIndicator({ name: SESSION_INDICATOR });
    }
  }, [ready, sessions]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    const list = markers ?? [];
    if (list.length === 0) {
      chart.removeIndicator({ name: NEWS_INDICATOR });
    } else if (chart.getIndicators({ name: NEWS_INDICATOR }).length === 0) {
      chart.createIndicator({ name: NEWS_INDICATOR, paneId: 'candle_pane', extendData: { markers: list } }, true);
    } else {
      chart.overrideIndicator({ name: NEWS_INDICATOR, extendData: { markers: list } });
    }
  }, [ready, markers]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    const marks = orderMarks ?? [];
    if (marks.length === 0) {
      chart.removeIndicator({ name: ORDERS_INDICATOR });
    } else if (chart.getIndicators({ name: ORDERS_INDICATOR }).length === 0) {
      chart.createIndicator({ name: ORDERS_INDICATOR, paneId: 'candle_pane', extendData: { marks } }, true);
    } else {
      chart.overrideIndicator({ name: ORDERS_INDICATOR, extendData: { marks } });
    }
  }, [ready, orderMarks]);

  useEffect(() => {
    const chart = chartRef.current;
    const node = el.current;
    if (!ready || !chart || !node) return;
    const list = indicators ?? [];
    for (const { id } of INDICATORS) {
      const want = list.find((i) => i.id === id);
      const name = indicatorName(id);
      if (!want) {
        chart.removeIndicator({ name });
        node.removeAttribute(`data-indicator-${id}`);
        continue;
      }
      const extendData = {
        settings: want.settings,
        color: want.color,
        onResult: (last: number | null) => node.setAttribute(`data-indicator-${id}`, last === null ? '' : String(last)),
      };
      const calcParams = Object.values(want.settings);
      if (chart.getIndicators({ name }).length === 0) {
        const paneId = indicatorPane(id);
        chart.createIndicator({ name, paneId, calcParams, extendData });
        chart.setPaneOptions({ id: paneId, height: indicatorPaneHeight(node.clientHeight), minHeight: 50 });
      } else {
        chart.overrideIndicator({ name, calcParams, extendData });
      }
    }
  }, [ready, indicators]);

  return (
    <div className="absolute inset-0">
      <div
        ref={el}
        className="h-full w-full"
        data-testid="kline-chart"
        data-ready={ready ? 'true' : 'false'}
        data-last-bar={lastBar ? JSON.stringify(lastBar) : ''}
        data-markers={markers?.length ?? 0}
        data-order-marks={orderMarks?.length ?? 0}
        data-loading={loading ?? ''}
      />
      {loading && <ChartLoading full={loading === 'init'} label={`${instrument.code} · ${tf}m`} />}
      {error && (
        <p role="alert" className="absolute top-2 left-2 rounded-md bg-loss/20 px-3 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Loading state for the chart: a sliding bar on top always; on a full reload (instrument, timeframe, replay
 * jump) the old candles dim and a label says what is loading. Motion only when the user allows it.
 */
function ChartLoading({ full, label }: { full: boolean; label: string }) {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-primary/15">
        <div className="h-full w-1/3 bg-primary motion-safe:animate-[chart-load_1.1s_ease-in-out_infinite]" />
      </div>
      {full ? (
        <div className="flex h-full items-center justify-center bg-background/35 backdrop-blur-[1px] motion-safe:animate-in motion-safe:fade-in">
          <span className="flex items-center gap-2 rounded-full border bg-popover/90 px-3 py-1.5 text-muted-foreground text-xs shadow">
            <span className="size-3 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
            Loading {label}
          </span>
        </div>
      ) : (
        <span className="sr-only">Loading older candles</span>
      )}
    </div>
  );
}
