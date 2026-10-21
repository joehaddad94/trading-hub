import { type Bar, MINUTE_MS, type StepMode, stepTargetBy, type Timeframe } from '@trading/backtest-engine';

/**
 * 1m candles around the replay cursor, held in memory so stepping either way needs no request (Joe's
 * exception to spec §3.2, 21 Oct 2026). Every minute in [`from`, `to`] that had a candle is in `bars`. Bars
 * after the cursor are a buffer only: nothing past the cursor is ever drawn, fed to an indicator or a fill.
 */
export type Tape = {
  instrument: string;
  from: number;
  to: number;
  bars: Bar[];
  /** `to` is the end of the available data. */
  ended: boolean;
};

/** 1m candles per refill request (the API's maximum page). */
export const TAPE_CHUNK = 1500;
/** Refill in the background once fewer than this many minutes are buffered ahead of the cursor. */
export const TAPE_LOW_WATER = 1000;
/** Minutes kept behind the cursor, for stepping back a minute without a request. */
const KEPT_BEHIND = 1500;
/** A refill asks this far ahead at most; the server caps it at now. */
export const TAPE_SPAN_MS = 14 * 86_400_000;

/** True when the tape holds every minute just after `cursor` for this instrument. */
export function tapeCovers(tape: Tape | null, instrument: string, cursor: number): tape is Tape {
  return tape !== null && tape.instrument === instrument && tape.from <= cursor + MINUTE_MS && tape.to >= cursor;
}

/** Minutes buffered ahead of the cursor. */
export function minutesAhead(tape: Tape, cursor: number): number {
  return (tape.to - cursor) / MINUTE_MS;
}

/** Where the next refill starts, and the tape it extends (a fresh one when the cursor left the old tape). */
export function refillFrom(tape: Tape | null, instrument: string, cursor: number): { after: number; base: Tape } {
  if (tapeCovers(tape, instrument, cursor)) return { after: tape.to + MINUTE_MS, base: tape };
  return {
    after: cursor + MINUTE_MS,
    base: { instrument, from: cursor + MINUTE_MS, to: cursor, bars: [], ended: false },
  };
}

/**
 * The tape after a refill page asked `after` … `until` (capped at `now`, as the server does). A full page
 * covers up to its last candle; a short one covers the whole range, and reaching now means the data ended.
 */
export function extendTape(
  base: Tape,
  page: { bars: Bar[]; hasMore: boolean },
  after: number,
  until: number,
  now: number,
): Tape {
  const cap = Math.min(until, Math.floor(now / MINUTE_MS) * MINUTE_MS);
  const fresh = page.bars.filter((b) => b.ts >= after && b.ts <= cap);
  const last = fresh.at(-1);
  const to = page.hasMore && last ? last.ts : Math.max(cap, after - MINUTE_MS);
  return { ...base, to, bars: [...base.bars, ...fresh], ended: !page.hasMore && cap < until };
}

/**
 * The next step from the tape: where the cursor lands and the minutes it reveals. Over a closed market the
 * step starts just before the next candle. `more` means the tape ends too soon; `end` means no data is left.
 */
export function stepFromTape(
  tape: Tape,
  cursor: number,
  tf: Timeframe,
  mode: StepMode,
  count: number,
): { target: number; bars: Bar[] } | 'more' | 'end' {
  let target = stepTargetBy(cursor, tf, mode, count);
  let bars = tape.bars.filter((b) => b.ts > cursor && b.ts <= target);
  if (bars.length === 0) {
    const next = tape.bars.find((b) => b.ts > cursor);
    if (!next) return tape.ended ? 'end' : 'more';
    target = stepTargetBy(next.ts - MINUTE_MS, tf, mode, count);
    bars = tape.bars.filter((b) => b.ts >= next.ts && b.ts <= target);
  }
  if (target > tape.to && !tape.ended) return 'more';
  return { target, bars };
}

/** Drops minutes far behind the cursor so the tape stays small. */
export function trimTape(tape: Tape, cursor: number): Tape {
  const behind = tape.bars.filter((b) => b.ts <= cursor).length;
  const drop = behind - KEPT_BEHIND;
  if (drop <= 0) return tape;
  const from = (tape.bars[drop - 1] as Bar).ts + MINUTE_MS;
  return { ...tape, from, bars: tape.bars.slice(drop) };
}

/** After stepping back to `target`: still valid when it covers the minute after it, otherwise dropped. */
export function rewindTape(tape: Tape | null, instrument: string, target: number): Tape | null {
  return tapeCovers(tape, instrument, target) ? tape : null;
}
