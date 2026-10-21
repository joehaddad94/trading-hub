'use client';

import {
  applyMinutes,
  barsPerTick,
  cursorForBar,
  MINUTE_MS,
  nextDayOpen,
  nextSessionWindow,
  playIntervalMs,
  type Speed,
  type StepMode,
  stepBackTarget,
  stepTargetBy,
  type Timeframe,
} from '@trading/backtest-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartApi } from './kline-chart';
import { fetchBarsFresh, fetchNextMinute } from './loader';

type Options = {
  instrument: string;
  tf: Timeframe;
  /** Cursor from the URL (ms) or null; the URL is updated through `onCursor`. */
  initialCursor: number | null;
  onCursor: (cursor: number | null) => void;
};

export type StepResult = 'ok' | 'end' | 'busy';

/** Empty kill zones a jump may skip (weekends, holidays) before giving up. */
const MAX_EMPTY_ZONES = 40;

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

  /**
   * One bar (or minute) back. Nothing new is revealed, so no lookahead; the chart reloads up to the earlier
   * cursor. The workspace only allows it with no live order, and never before `floor` (the last closed trade),
   * so a run's results can't be re-traded with hindsight.
   */
  const stepBack = useCallback(
    (mode: StepMode, rule: { blocked: string | null; floor: number | null }): StepResult => {
      const from = cursorRef.current;
      if (from === null || busy.current) return 'busy';
      if (rule.blocked) {
        setMessage(rule.blocked);
        return 'busy';
      }
      const { floor } = rule;
      const target = stepBackTarget(from, tf, mode);
      if (floor !== null && target < floor) {
        setMessage('You can’t go back past your last closed trade.');
        return 'end';
      }
      setPlaying(false);
      setMessage(null);
      moveTo(target, true);
      return 'ok';
    },
    [tf, moveTo],
  );

  const step = useCallback(
    async (mode: StepMode, count = 1): Promise<StepResult> => {
      const from = cursorRef.current;
      const api = chartApi.current;
      if (from === null || !api || busy.current) return 'busy';
      busy.current = true;
      try {
        let target = stepTargetBy(from, tf, mode, count);
        let page = await fetchBarsFresh({
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
          target = stepTargetBy(next - MINUTE_MS, tf, mode, count);
          page = await fetchBarsFresh({
            instrument,
            tf: 1,
            after: new Date(next),
            until: new Date(target),
            count: 1500,
          });
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

  /**
   * Next session / next day. Lands just before the first candle at or after the open, so a weekend or holiday
   * never leaves the chart parked on an empty zone: a kill zone with no candles is skipped (asks times only,
   * never prices). Open trades are replayed over everything skipped once the cursor moves.
   */
  const jump = useCallback(
    async (kind: 'session' | 'day') => {
      const from = cursorRef.current;
      if (from === null || busy.current) return;
      busy.current = true;
      setMessage(null);
      setPlaying(false);
      try {
        let probe = from;
        for (let i = 0; i < MAX_EMPTY_ZONES; i += 1) {
          const zone = kind === 'session' ? nextSessionWindow(probe) : { at: nextDayOpen(probe), end: Infinity };
          const next = await fetchNextMinute(instrument, new Date(zone.at));
          if (next === null) {
            setMessage('End of the available data.');
            return;
          }
          if (next < zone.end) {
            // The first candle of the zone is the next bar to appear.
            moveTo(next - MINUTE_MS, true);
            return;
          }
          probe = next - MINUTE_MS;
        }
        setMessage('No session with candles found in the next two weeks.');
      } catch (e) {
        setMessage((e as Error).message);
      } finally {
        busy.current = false;
      }
    },
    [instrument, moveTo],
  );

  useEffect(() => {
    if (!playing) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const interval = playIntervalMs(speed);
    // How long the last step's request took. When it is slower than the tick, each tick reveals several bars
    // in one request, so playback keeps its speed instead of crawling (still never past the cursor).
    let lastStepMs = 0;
    const tick = async () => {
      if (stopped) return;
      const bars = barsPerTick(lastStepMs, interval);
      const started = performance.now();
      const result = await step('bar', bars);
      lastStepMs = performance.now() - started;
      if (stopped) return;
      if (result === 'end') {
        setPlaying(false);
        return;
      }
      // The request time counts towards the tick.
      timer = setTimeout(tick, Math.max(0, interval * bars - lastStepMs));
    };
    timer = setTimeout(tick, interval);
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
    stepBack,
    jump,
    onChartReady,
  };
}
