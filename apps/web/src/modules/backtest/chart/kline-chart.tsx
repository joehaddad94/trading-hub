'use client';

import { type Bar, MINUTE_MS, type Timeframe } from '@trading/backtest-engine';
import type { Chart, DataLoaderGetBarsParams, KLineData, Point } from 'klinecharts';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { fetchBars, toKLine } from './loader';
import { SESSION_INDICATOR, sessionShading } from './session-shading';
import { chartStyles } from './styles';

/** Bars per lazy-load request (spec §2.2: windows, never the whole year). */
const PAGE = 500;
/** Bars kept to the right of the anchor when a timeframe switch reloads around it. */
const RIGHT_OF_ANCHOR = 60;

/** What the workspace can do with a mounted chart (replay pushes bars through it). */
export type ChartApi = {
  /** Upserts bars at the right edge: a bar with the last bar's time replaces it, a newer one is appended. */
  upsert(bars: Bar[]): void;
  lastBar(): Bar | null;
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
};

type Klinecharts = typeof import('klinecharts');

const toBar = (k: KLineData): Bar => ({
  ts: k.timestamp,
  open: k.open,
  high: k.high,
  low: k.low,
  close: k.close,
  volume: k.volume ?? 0,
});

/**
 * KLineCharts adapter (backtester spec §2–3). Loads candles lazily through `/api/backtest/candles` with
 * `until` = replay cursor (or now); switching instrument or timeframe reloads around the bar at the right
 * edge of the view, so the time range is kept.
 */
export function KLineChart(props: ChartProps) {
  const { instrument, tf, timezone, sessions, cursorRef, reloadKey, onReady, onBarClick } = props;
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const anchorRef = useRef<number | null>(null);
  const pushRef = useRef<((bar: KLineData) => void) | null>(null);
  const clickRef = useRef(onBarClick);
  clickRef.current = onBarClick;
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
    const onClick = (event: MouseEvent) => {
      const chart = chartRef.current;
      if (!chart || !node || !clickRef.current) return;
      const rect = node.getBoundingClientRect();
      const point = chart.convertFromPixel([{ x: event.clientX - rect.left, y: event.clientY - rect.top }], {
        paneId: 'candle_pane',
      }) as Partial<Point>[];
      const index = point[0]?.dataIndex;
      const bar = index === undefined ? undefined : chart.getDataList()[index];
      if (bar) clickRef.current(bar.timestamp);
    };
    void import('klinecharts').then((k) => {
      if (disposed || !node) return;
      lib = k;
      if (!k.getSupportedIndicators().includes(SESSION_INDICATOR)) k.registerIndicator(sessionShading);
      const chart = k.init(node, { styles: chartStyles, timezone });
      if (!chart) return;
      chartRef.current = chart;
      node.addEventListener('click', onClick, true);
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(node);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      node?.removeEventListener('click', onClick, true);
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

  return (
    <div className="relative h-full w-full">
      <div
        ref={el}
        className="h-full w-full"
        data-testid="kline-chart"
        data-ready={ready ? 'true' : 'false'}
        data-last-bar={lastBar ? JSON.stringify(lastBar) : ''}
      />
      {error && (
        <p role="alert" className="absolute top-2 left-2 rounded-md bg-loss/20 px-3 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
