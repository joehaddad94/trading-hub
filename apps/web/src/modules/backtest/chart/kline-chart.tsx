'use client';

import { MINUTE_MS, type Timeframe } from '@trading/backtest-engine';
import type { Chart, DataLoaderGetBarsParams } from 'klinecharts';
import { useEffect, useRef, useState } from 'react';
import { fetchBars, toKLine } from './loader';
import { SESSION_INDICATOR, sessionShading } from './session-shading';
import { chartStyles } from './styles';

/** Bars per lazy-load request (spec §2.2: windows, never the whole year). */
const PAGE = 500;
/** Bars kept to the right of the anchor when a timeframe switch reloads around it. */
const RIGHT_OF_ANCHOR = 60;

export type ChartProps = {
  instrument: { code: string; priceDigits: number };
  tf: Timeframe;
  timezone: string;
  sessions: boolean;
};

type Klinecharts = typeof import('klinecharts');

/**
 * KLineCharts adapter (backtester spec §2). Loads candles lazily through `/api/backtest/candles`; switching
 * instrument or timeframe reloads around the bar at the right edge of the view, so the time range is kept.
 */
export function KLineChart({ instrument, tf, timezone, sessions }: ChartProps) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const anchorRef = useRef<number | null>(null);
  const generation = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // The chart is created once; prop changes are applied by the effects below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: timezone is applied by its own effect.
  useEffect(() => {
    let disposed = false;
    let lib: Klinecharts | null = null;
    let observer: ResizeObserver | null = null;
    void import('klinecharts').then((k) => {
      if (disposed || !el.current) return;
      lib = k;
      if (!k.getSupportedIndicators().includes(SESSION_INDICATOR)) k.registerIndicator(sessionShading);
      const chart = k.init(el.current, { styles: chartStyles, timezone });
      if (!chart) return;
      chartRef.current = chart;
      observer = new ResizeObserver(() => chart.resize());
      observer.observe(el.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (lib && el.current) lib.dispose(el.current);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart) return;
    // Keep the visible time range: remember the bar at the right edge unless the view is at the latest bar.
    const list = chart.getDataList();
    const range = chart.getVisibleRange();
    anchorRef.current =
      list.length > 0 && range.realTo < list.length ? (list[range.realTo - 1]?.timestamp ?? null) : null;
    const gen = ++generation.current;
    setError(null);
    chart.setDataLoader({
      getBars: async ({ type, timestamp, callback }: DataLoaderGetBarsParams) => {
        const now = new Date();
        const anchor = anchorRef.current;
        try {
          if (type === 'init') {
            const before = anchor ? new Date(anchor + RIGHT_OF_ANCHOR * tf * MINUTE_MS) : undefined;
            const page = await fetchBars({ instrument: instrument.code, tf, until: now, before, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore, backward: Boolean(anchor) });
            if (anchor) chart.scrollToTimestamp(anchor);
          } else if (type === 'forward' && timestamp) {
            const page = await fetchBars({
              instrument: instrument.code,
              tf,
              until: now,
              before: new Date(timestamp),
              count: PAGE,
            });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { forward: page.hasMore });
          } else if (type === 'backward' && timestamp) {
            const after = new Date(timestamp + tf * MINUTE_MS);
            const page = await fetchBars({ instrument: instrument.code, tf, until: now, after, count: PAGE });
            if (gen !== generation.current) return;
            callback(page.bars.map(toKLine), { backward: page.hasMore });
          } else {
            callback([], false);
          }
        } catch (e) {
          if (gen !== generation.current) return;
          setError((e as Error).message);
          callback([], false);
        }
      },
    });
    chart.setSymbol({ ticker: instrument.code, pricePrecision: instrument.priceDigits, volumePrecision: 2 });
    chart.setPeriod({ type: 'minute', span: tf });
  }, [ready, instrument.code, instrument.priceDigits, tf]);

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
      <div ref={el} className="h-full w-full" data-testid="kline-chart" data-ready={ready ? 'true' : 'false'} />
      {error && (
        <p role="alert" className="absolute top-2 left-2 rounded-md bg-loss/20 px-3 py-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
