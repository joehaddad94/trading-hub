'use client';

import { type Bar, MINUTE_MS, type Timeframe } from '@trading/backtest-engine';
import { INDICATORS } from '@trading/indicators';
import type { Chart, DataLoaderGetBarsParams, KLineData, Point } from 'klinecharts';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { type ActiveIndicator, INDICATOR_TEMPLATES, indicatorName, indicatorPane } from './indicators';
import { fetchBars, toKLine } from './loader';
import { type Marker, NEWS_INDICATOR, newsMarkers } from './news-markers';
import { ORDERS_INDICATOR, type OrderMark, orderLines } from './order-lines';
import { SESSION_INDICATOR, sessionShading } from './session-shading';
import { chartStyles } from './styles';
import { TOOLS } from './tools/registry';

/** Bars per lazy-load request (spec §2.2: windows, never the whole year). */
const PAGE = 500;
/** Bars kept to the right of the anchor when a timeframe switch reloads around it. */
const RIGHT_OF_ANCHOR = 60;

/** What the workspace can do with a mounted chart (replay pushes bars through it). */
export type ChartApi = {
  /** Upserts bars at the right edge: a bar with the last bar's time replaces it, a newer one is appended. */
  upsert(bars: Bar[]): void;
  lastBar(): Bar | null;
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
  /** News markers (one per bar); empty hides them. */
  markers?: Marker[];
  /** Bar under the crosshair, or null when the pointer leaves. */
  onCrosshair?: (barStart: number | null) => void;
  /** Indicators shown in their own panes below the price chart. */
  indicators?: ActiveIndicator[];
  /** Simulated orders and trades of this instrument. */
  orderMarks?: OrderMark[];
};

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
  const crosshairRef = useRef(onCrosshair);
  crosshairRef.current = onCrosshair;
  const generation = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [lastBar, setLastBar] = useState<Bar | null>(null);

  // The chart is created once; prop changes are applied by the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone is applied by its own effect.
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
    void import('klinecharts').then((k) => {
      if (disposed || !node) return;
      lib = k;
      if (!k.getSupportedIndicators().includes(SESSION_INDICATOR)) k.registerIndicator(sessionShading);
      if (!k.getSupportedIndicators().includes(NEWS_INDICATOR)) k.registerIndicator(newsMarkers);
      if (!k.getSupportedIndicators().includes(ORDERS_INDICATOR)) k.registerIndicator(orderLines);
      for (const t of INDICATOR_TEMPLATES) if (!k.getSupportedIndicators().includes(t.name)) k.registerIndicator(t);
      const overlays = k.getSupportedOverlays();
      for (const tool of TOOLS) if (!overlays.includes(tool.overlay.name)) k.registerOverlay(tool.overlay);
      const chart = k.init(node, { styles: chartStyles, timezone });
      if (!chart) return;
      chartRef.current = chart;
      chart.subscribeAction('onCrosshairChange', (data) => {
        // The payload is the pointer position only; map it to the bar like a click.
        const x = (data as { x?: number } | undefined)?.x;
        crosshairRef.current?.(typeof x === 'number' ? barAt(chart, x) : null);
      });
      node.addEventListener('click', onClick, true);
      node.addEventListener('mouseleave', onLeave);
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(node);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      node?.removeEventListener('click', onClick, true);
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
    };
    const api: ChartApi = {
      upsert: (bars) => {
        for (const bar of bars) pushRef.current?.(toKLine(bar));
        sync();
      },
      lastBar: () => {
        const last = chart.getDataList().at(-1);
        return last ? toBar(last) : null;
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
    const syncLast = () => {
      const last = chart.getDataList().at(-1);
      setLastBar(last ? toBar(last) : null);
    };
    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }: DataLoaderGetBarsParams) => {
        const until = new Date(cursorRef.current ?? Date.now());
        const anchor = anchorRef.current;
        try {
          if (type === 'init') {
            const before = anchor ? new Date(anchor + RIGHT_OF_ANCHOR * tf * MINUTE_MS) : undefined;
            const page = await fetchBars({ instrument: instrument.code, tf, until, before, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore, backward: Boolean(anchor) });
            if (anchor) chart.scrollToTimestamp(anchor);
            syncLast();
          } else if (type === 'forward' && timestamp) {
            const page = await fetchBars({
              instrument: instrument.code,
              tf,
              until,
              before: new Date(timestamp),
              count: PAGE,
            });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore });
          } else if (type === 'backward' && timestamp) {
            const after = new Date(timestamp + tf * MINUTE_MS);
            const page = await fetchBars({ instrument: instrument.code, tf, until, after, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { backward: page.hasMore });
            syncLast();
          } else {
            callback([], false);
          }
        } catch (e) {
          if (gen !== generation.current) return;
          setError((e as Error).message);
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
      />
      {error && (
        <p role="alert" className="absolute top-2 left-2 rounded-md bg-loss/20 px-3 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
