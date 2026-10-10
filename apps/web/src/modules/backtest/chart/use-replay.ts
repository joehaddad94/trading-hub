'use client';

import {
  applyMinutes,
  cursorForBar,
  MINUTE_MS,
  nextDayOpen,
  nextSessionOpen,
  playIntervalMs,
  type Speed,
  type StepMode,
  stepTarget,
  type Timeframe,
} from '@trading/backtest-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartApi } from './kline-chart';
import { fetchBars, fetchNextMinute } from './loader';

type Options = {
  instrument: string;
  tf: Timeframe;
  /** Cursor from the URL (ms) or null; the URL is updated through `onCursor`. */
  initialCursor: number | null;
  onCursor: (cursor: number | null) => void;
};

export type StepResult = 'ok' | 'end' | 'busy';

/**
 * Replay state machine (backtester spec §3). Every request carries `until` ≤ the new cursor, so no price
 * after the cursor ever reaches the browser; a closed market is skipped by asking only when the next candle is.
 */
export function useReplay({ instrument, tf, initialCursor, onCursor }: Options) {
  const cursorRef = useRef<number | null>(initialCursor);
  const [cursor, setCursor] = useState<number | null>(initialCursor);
  const [reloadKey, setReloadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  const [message, setMessage] = useState<string | null>(null);
  const chartApi = useRef<ChartApi | null>(null);
  const busy = useRef(false);

  const moveTo = useCallback(
    (next: number | null, reload: boolean) => {
      cursorRef.current = next;
      setCursor(next);
      onCursor(next);
      if (reload) setReloadKey((k) => k + 1);
    },
    [onCursor],
  );

  const start = useCallback(
    (at: number) => {
      setPlaying(false);
      setMessage(null);
      moveTo(Math.floor(at / MINUTE_MS) * MINUTE_MS, true);
    },
    [moveTo],
  );

  const startAtBar = useCallback((barStart: number) => start(cursorForBar(barStart, tf)), [start, tf]);

  const exit = useCallback(() => {
    setPlaying(false);
    setMessage(null);
    moveTo(null, true);
  }, [moveTo]);

  const step = useCallback(
    async (mode: StepMode): Promise<StepResult> => {
      const from = cursorRef.current;
      const api = chartApi.current;
      if (from === null || !api || busy.current) return 'busy';
      busy.current = true;
      try {
        let target = stepTarget(from, tf, mode);
        let page = await fetchBars({
          instrument,
          tf: 1,
          after: new Date(from + MINUTE_MS),
          until: new Date(target),
          count: 1500,
        });
        if (page.bars.length === 0) {
          // Market closed: find when the next candle is (a time, not a price) and step from just before it.
          const next = await fetchNextMinute(instrument, new Date(from + MINUTE_MS));
          if (next === null) {
            setMessage('End of the available data.');
            return 'end';
          }
          target = stepTarget(next - MINUTE_MS, tf, mode);
          page = await fetchBars({ instrument, tf: 1, after: new Date(next), until: new Date(target), count: 1500 });
        }
        api.upsert(applyMinutes(api.lastBar(), page.bars, tf));
        moveTo(target, false);
        return 'ok';
      } catch (e) {
        setMessage((e as Error).message);
        return 'end';
      } finally {
        busy.current = false;
      }
    },
    [instrument, tf, moveTo],
  );

  const jump = useCallback(
    (kind: 'session' | 'day') => {
      const from = cursorRef.current;
      if (from === null) return;
      setMessage(null);
      const at = kind === 'session' ? nextSessionOpen(from).at : nextDayOpen(from);
      // The open itself is the next bar to appear.
      moveTo(at - MINUTE_MS, true);
    },
    [moveTo],
  );

  useEffect(() => {
    if (!playing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      const result = await step('bar');
      if (stopped) return;
      if (result === 'end') {
        setPlaying(false);
        return;
      }
      timer = setTimeout(tick, playIntervalMs(speed));
    };
    timer = setTimeout(tick, playIntervalMs(speed));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [playing, speed, step]);

  const onChartReady = useCallback((api: ChartApi | null) => {
    chartApi.current = api;
  }, []);

  return {
    cursor,
    cursorRef,
    reloadKey,
    playing,
    setPlaying,
    speed,
    setSpeed,
    message,
    start,
    startAtBar,
    exit,
    step,
    jump,
    onChartReady,
  };
}
