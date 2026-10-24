'use client';

import {
  applyMinutes,
  type Bar,
  barsPerTick,
  bucketStart,
  cursorForBar,
  MINUTE_MS,
  nextDayOpen,
  nextSessionWindow,
  playIntervalMs,
  resolveStart,
  type Speed,
  type StepMode,
  type Timeframe,
} from '@trading/backtest-engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartApi } from './kline-chart';
import { fetchBarsFresh, fetchNextMinute } from './loader';
import {
  extendTape,
  minutesAhead,
  refillFrom,
  rewindTape,
  stepFromTape,
  TAPE_CHUNK,
  TAPE_LOW_WATER,
  TAPE_SPAN_MS,
  type Tape,
  tapeCovers,
  trimTape,
} from './tape';

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
/** Refills a step may wait for before it gives up (each covers up to two weeks). */
const MAX_REFILLS = 4;

/**
 * The chart one step back, from bars already on screen (spec §3.1). A bar step drops the newest bar and parks
 * the cursor on the last minute of the one before, so every press removes exactly one bar, weekends included.
 * A minute step at 5m/15m rebuilds the forming bar from the 1m log, or returns null when the log doesn't reach
 * the start of that bar (the caller then asks for those minutes, all before the cursor).
 */
export function rewindBars(
  bars: Bar[],
  cursor: number,
  tf: Timeframe,
  mode: StepMode,
  log: Pick<Tape, 'from' | 'bars'> | null,
): { target: number; bars: Bar[] } | null | 'start' {
  if (mode === 'bar' || tf === 1) {
    const kept = bars.filter((b) => b.ts < bucketStart(cursor, tf));
    const last = kept.at(-1);
    if (!last) return 'start';
    return { target: last.ts + (tf - 1) * MINUTE_MS, bars: kept };
  }
  const target = cursor - MINUTE_MS;
  const bucket = bucketStart(target, tf);
  const before = bars.filter((b) => b.ts < bucket);
  if (target - bucket === (tf - 1) * MINUTE_MS) {
    // The previous minute closes its bar: that bar is already complete on the chart.
    const done = bars.find((b) => b.ts === bucket);
    return { target, bars: done ? [...before, done] : before };
  }
  if (!log || log.from > bucket) return null;
  const forming = applyMinutes(
    null,
    log.bars.filter((b) => b.ts >= bucket && b.ts <= target),
    tf,
  );
  return { target, bars: [...before, ...forming] };
}

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
  const tape = useRef<Tape | null>(null);
  const refilling = useRef<Promise<void> | null>(null);

  /** Tops up the tape after the cursor; one request at a time. Resolves when the tape has grown. */
  const refill = useCallback((): Promise<void> => {
    if (refilling.current) return refilling.current;
    const at = cursorRef.current;
    if (at === null) return Promise.resolve();
    const { after, base } = refillFrom(tape.current, instrument, at);
    if (base.ended) return Promise.resolve();
    const until = after + TAPE_SPAN_MS;
    const run = fetchBarsFresh({
      instrument,
      tf: 1,
      after: new Date(after),
      until: new Date(until),
      count: TAPE_CHUNK,
    })
      .then((page) => {
        // The cursor may have jumped meanwhile: only keep a tape that still lines up with it.
        const next = extendTape(base, page, after, until, Date.now());
        const now = cursorRef.current;
        if (now !== null && tapeCovers(next, instrument, now)) tape.current = next;
      })
      .finally(() => {
        refilling.current = null;
      });
    refilling.current = run;
    return run;
  }, [instrument]);

  const moveTo = useCallback(
    (next: number | null, reload: boolean) => {
      cursorRef.current = next;
      setCursor(next);
      onCursor(next);
      if (reload) {
        tape.current = null;
        setReloadKey((k) => k + 1);
      }
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

  /**
   * Start panel (spec §3.1): starts just before the first candle at or after a kill-zone open, so the next step
   * shows the open and a holiday or break never parks the chart on empty time. Asks a time only, never prices.
   */
  const startFrom = useCallback(
    async (target: number): Promise<{ ok: true; cursor: number; snapped: boolean } | { ok: false; error: string }> => {
      let next: number | null;
      try {
        next = await fetchNextMinute(instrument, new Date(target));
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
      const resolved = resolveStart(target, next);
      if (!resolved) return { ok: false, error: 'No candles from that day on yet. Pick an earlier day.' };
      start(resolved.cursor);
      return { ok: true, ...resolved };
    },
    [instrument, start],
  );

  const startAtBar = useCallback((barStart: number) => start(cursorForBar(barStart, tf)), [start, tf]);

  const exit = useCallback(() => {
    setPlaying(false);
    setMessage(null);
    moveTo(null, true);
  }, [moveTo]);

  /**
   * One bar (or minute) back, from what is already on the chart: nothing new is revealed (no lookahead) and
   * nothing is reloaded, so it is as quick as a step forward. The workspace only allows it with no live order,
   * and never before `floor` (the last closed trade), so a run's results can't be re-traded with hindsight.
   */
  const stepBack = useCallback(
    async (mode: StepMode, rule: { blocked: string | null; floor: number | null }): Promise<StepResult> => {
      const from = cursorRef.current;
      const api = chartApi.current;
      // While the chart reloads (a new date, a jump), its bars are the old window: wait for the new one.
      if (from === null || !api || busy.current || api.reloading()) return 'busy';
      if (rule.blocked) {
        setMessage(rule.blocked);
        return 'busy';
      }
      busy.current = true;
      try {
        const log = tapeCovers(tape.current, instrument, from) ? tape.current : null;
        let back = rewindBars(api.bars(), from, tf, mode, log);
        if (back === null) {
          // Minute step into a bar the log doesn't cover: ask for its minutes (all before the cursor).
          const target = from - MINUTE_MS;
          const bucket = bucketStart(target, tf);
          const page = await fetchBarsFresh({
            instrument,
            tf: 1,
            after: new Date(bucket),
            until: new Date(target),
            count: tf,
          });
          back = rewindBars(api.bars(), from, tf, mode, { from: bucket, bars: page.bars });
        }
        if (back === null || back === 'start') {
          setMessage('No earlier candles loaded. Scroll left or start the replay earlier.');
          return 'end';
        }
        if (rule.floor !== null && back.target < rule.floor) {
          setMessage('You can’t go back past your last closed trade.');
          return 'end';
        }
        const target = back.target;
        setPlaying(false);
        setMessage(null);
        tape.current = rewindTape(tape.current, instrument, target);
        api.rewind(back.bars);
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
   * Forward by a bar or a minute, from the in-memory tape: no request while it has candles, and it is refilled
   * in the background before it runs low. Only the minutes up to the new cursor are drawn.
   */
  const step = useCallback(
    async (mode: StepMode, count = 1): Promise<StepResult> => {
      const from = cursorRef.current;
      const api = chartApi.current;
      // While the chart reloads (a new date, a jump), its bars are the old window: wait for the new one.
      if (from === null || !api || busy.current || api.reloading()) return 'busy';
      busy.current = true;
      try {
        let move: ReturnType<typeof stepFromTape> = 'more';
        for (let i = 0; i <= MAX_REFILLS; i += 1) {
          const current = tape.current;
          move = tapeCovers(current, instrument, from) ? stepFromTape(current, from, tf, mode, count) : 'more';
          if (move !== 'more') break;
          await refill();
        }
        if (move === 'end') {
          setMessage('End of the available data.');
          return 'end';
        }
        if (move === 'more') {
          setMessage('No candles found ahead. Try Next day.');
          return 'end';
        }
        api.upsert(applyMinutes(api.lastBar(), move.bars, tf));
        moveTo(move.target, false);
        const current = tape.current;
        if (current) {
          tape.current = trimTape(current, move.target);
          if (minutesAhead(tape.current, move.target) < TAPE_LOW_WATER) void refill().catch(() => undefined);
        }
        return 'ok';
      } catch (e) {
        setMessage((e as Error).message);
        return 'end';
      } finally {
        busy.current = false;
      }
    },
    [instrument, tf, moveTo, refill],
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

  // Fill the tape as soon as replay starts (or restarts), so the first step needs no request either.
  const replaying = cursor !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey marks a (re)start.
  useEffect(() => {
    if (replaying) void refill().catch(() => undefined);
  }, [replaying, reloadKey, refill]);

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
    /** Shows a line under the replay bar (cleared by the next start or step). */
    notify: setMessage,
    start,
    startFrom,
    startAtBar,
    exit,
    step,
    stepBack,
    jump,
    onChartReady,
  };
}
