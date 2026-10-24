'use client';

import { TZDate } from '@date-fns/tz';
import {
  addDays,
  type CalendarDay,
  dayBlocked,
  dayOf,
  formatClock,
  monthGrid,
  parseClock,
  pickOf,
  pickTime,
  randomStart,
  type StartPick,
  sameDay,
  timeOn,
  zonesOnDay,
} from '@trading/backtest-engine';
import { SESSION_TZ } from '@trading/core';
import { isTradingHours } from '@trading/market-data';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Dices, Loader2, Play, RotateCcw, Scissors, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
/** NY AM open: the time a fresh panel suggests, the session most replays start from. */
const NY_AM = 'ny_am';
const DAY_MS = 86_400_000;

type Data = { from: number; to: number } | null;

/** The newest pickable day at or before `day` (back up to two weeks), so the panel never opens on a closed day. */
function openDayAtOrBefore(day: CalendarDay, timezone: string, data: Data, now: number): CalendarDay {
  for (let i = 0; i < 14; i += 1) {
    const d = addDays(day, -i);
    if (!dayBlocked(d, timezone, data, now, isTradingHours)) return d;
  }
  return day;
}

/**
 * What the panel opens on: the last start when there is one (so a second pick starts from the first), else the
 * replay cursor, else the NY AM open of the last trading day before today.
 */
export function initialPick(
  lastStart: number | null,
  cursor: number | null,
  timezone: string,
  data: Data,
  now: number,
): StartPick {
  // Mid-replay, the last start counts only when this replay could have come from it (at or before the cursor,
  // within two weeks); a replay opened from a link starts the panel at its cursor instead.
  const fits = lastStart !== null && (cursor === null || (lastStart <= cursor && cursor - lastStart < 14 * DAY_MS));
  const from = fits ? lastStart : cursor;
  if (from !== null) {
    const pick = pickOf(from, timezone);
    const day = openDayAtOrBefore(pick.day, timezone, data, now);
    return sameDay(day, pick.day) ? pick : { day, minute: pick.minute };
  }
  const day = openDayAtOrBefore(addDays(dayOf(now, timezone), -1), timezone, data, now);
  const open = zonesOnDay(day, timezone).find((z) => z.name === NY_AM);
  return { day, minute: open ? pickOf(open.at, timezone).minute : 16 * 60 + 30 };
}

/**
 * Replay start panel (backtester spec §3.1, Joe 24 Oct 2026: flexible, quick and easy). A calendar with closed and
 * no-data days greyed out, a time box, and the day's kill zones as shortcuts that fill the time. Enter or Start
 * starts. It opens on the last start, so changing the date keeps the time and changing the time keeps the date.
 * A popover on desktop, a bottom sheet on phones.
 */
export function ReplayStartPanel({
  timezone,
  data,
  initial,
  lastStart,
  replaying,
  onStart,
  onSelectBar,
  onClose,
}: {
  timezone: string;
  data: Data;
  initial: StartPick;
  /** The last start (ms), to label Start as Restart when nothing changed. */
  lastStart: number | null;
  replaying: boolean;
  /** Starts the replay; resolves to an error message, or null once it started. */
  onStart: (pick: StartPick) => Promise<string | null>;
  /** Closes the panel and picks a bar on the chart instead. */
  onSelectBar: () => void;
  onClose: () => void;
}) {
  const now = useMemo(() => Date.now(), []);
  const [day, setDay] = useState(initial.day);
  const [view, setView] = useState({ y: initial.day.y, m: initial.day.m });
  const [clock, setClock] = useState(formatClock(initial.minute));
  const [busy, setBusy] = useState<'start' | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Desktop: the time box takes focus with its text selected, so typing "1015" + Enter is a whole restart.
  // Phones would pop the keyboard over the sheet, so they don't.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) timeRef.current?.select();
  }, []);

  const blocked = (d: CalendarDay) => dayBlocked(d, timezone, data, now, isTradingHours);
  const minute = parseClock(clock);
  const zones = zonesOnDay(day, timezone);
  const dayWhy = blocked(day);
  const target = minute === null ? null : pickTime({ day, minute }, timezone);
  const inFuture = target !== null && target > now;
  const same = target !== null && target === lastStart;
  const inNewYork = timezone === SESSION_TZ;

  const chooseDay = (d: CalendarDay) => {
    setError(null);
    setDay(d);
    setView({ y: d.y, m: d.m });
  };

  const run = async (pick: StartPick, which: 'start' | 'random') => {
    if (busy) return;
    setBusy(which);
    setError(null);
    const failed = await onStart(pick);
    setBusy(null);
    if (failed) setError(failed);
    else onClose();
  };

  const submit = () => {
    if (minute === null) {
      setError('Type a time like 16:30.');
      timeRef.current?.focus();
      return;
    }
    if (dayWhy) {
      setError(`${format(new Date(day.y, day.m - 1, day.d), 'EEE d MMM')}: ${dayWhy.toLowerCase()}. Pick another day.`);
      return;
    }
    if (inFuture) {
      setError('That time is in the future. Pick an earlier time.');
      return;
    }
    void run({ day, minute }, 'start');
  };

  const random = () => {
    const pick = data ? randomStart(data.from, data.to, Math.random, timezone, isTradingHours) : null;
    if (!pick) {
      setError('Not enough candles for a random start yet.');
      return;
    }
    chooseDay(pick.day);
    setClock(formatClock(pick.minute));
    void run(pick, 'random');
  };

  // Arrow keys move the day; closed days are skipped over.
  const onGridKey = (e: KeyboardEvent) => {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    let next = addDays(day, by);
    for (let i = 0; i < 7 && blocked(next); i += 1) next = addDays(next, Math.sign(by));
    if (blocked(next)) return;
    chooseDay(next);
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next.y}-${next.m}-${next.d}"]`)?.focus(),
    );
  };

  const monthStart = timeOn({ y: view.y, m: view.m, d: 1 }, 0, timezone);
  const nextMonth = view.m === 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: view.m + 1 };
  const canPrev = !data || monthStart > data.from;
  const canNext = timeOn({ ...nextMonth, d: 1 }, 0, timezone) <= now;

  return (
    <>
      <button
        type="button"
        aria-label="Close start panel"
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default bg-black/50 md:bg-transparent"
        onClick={onClose}
      />
      <form
        role="dialog"
        aria-label={replaying ? 'Replay from another date' : 'Start replay'}
        data-testid="replay-start-panel"
        className={cn(
          'fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-50 max-h-[80dvh] overflow-y-auto rounded-t-xl border-t bg-popover text-popover-foreground shadow-2xl',
          'md:absolute md:inset-x-auto md:top-full md:bottom-auto md:left-2 md:mt-1 md:max-h-none md:w-[38rem] md:rounded-lg md:border',
        )}
        // Keep the chart's shortcuts (timeframe keys, replay steps) out while choosing.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') e.stopPropagation();
        }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-input md:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <h2 className="font-semibold text-sm">{replaying ? 'Replay from another date' : 'Start replay'}</h2>
          <div className="flex items-center gap-1">
            <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground" data-testid="start-tz">
              {inNewYork ? 'New York time' : 'Beirut time'}
            </span>
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Close"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-3 md:grid-cols-[1fr_17rem]">
          <div className="grid content-start gap-1.5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                aria-label="Previous month"
                disabled={!canPrev}
                onClick={() => setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { y: v.y, m: v.m - 1 }))}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <span className="font-medium text-sm" aria-live="polite">
                {format(new Date(view.y, view.m - 1, 1), 'MMMM yyyy')}
              </span>
              <button
                type="button"
                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                aria-label="Next month"
                disabled={!canNext}
                onClick={() => setView(nextMonth)}
              >
                <ChevronRight className="size-4" aria-hidden />
              </button>
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: a day picker with arrow-key moves, not a data table. */}
            <div
              ref={gridRef}
              role="grid"
              aria-label="Day"
              className="grid grid-cols-7 gap-0.5 text-center text-xs"
              onKeyDown={onGridKey}
            >
              {DOW.map((d) => (
                <span key={d} className="py-1 text-[10px] text-muted-foreground">
                  {d}
                </span>
              ))}
              {monthGrid(view.y, view.m).map((d, i) => {
                // biome-ignore lint/suspicious/noArrayIndexKey: blanks before the 1st only have a position.
                if (!d) return <span key={`pad-${i}`} />;
                const why = blocked(d);
                const selected = sameDay(d, day);
                const wasStart = lastStart !== null && sameDay(d, dayOf(lastStart, timezone));
                return (
                  <button
                    key={`${d.y}-${d.m}-${d.d}`}
                    type="button"
                    data-day={`${d.y}-${d.m}-${d.d}`}
                    disabled={!!why}
                    title={why ?? (wasStart ? 'Your last start' : undefined)}
                    aria-pressed={selected}
                    aria-label={`${format(new Date(d.y, d.m - 1, d.d), 'EEEE d MMMM yyyy')}${why ? `, ${why.toLowerCase()}` : ''}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => chooseDay(d)}
                    className={cn(
                      'relative h-9 rounded-md font-mono num md:h-8',
                      why ? 'cursor-not-allowed text-muted-foreground/35' : 'hover:bg-accent',
                      selected && !why && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {d.d}
                    {wasStart && !why && (
                      <span
                        aria-hidden
                        className={cn(
                          'absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full',
                          selected ? 'bg-primary-foreground' : 'bg-primary',
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-3">
            <label className="grid gap-1">
              <span className="text-[10.5px] text-muted-foreground uppercase tracking-wider">Time</span>
              <div className="flex items-center gap-2">
                <input
                  ref={timeRef}
                  value={clock}
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Start time"
                  aria-invalid={minute === null}
                  onChange={(e) => {
                    setError(null);
                    setClock(e.target.value);
                  }}
                  onBlur={() => minute !== null && setClock(formatClock(minute))}
                  className={cn(
                    'h-10 w-24 rounded-md border bg-background px-2 text-center font-mono text-base text-foreground',
                    minute === null && 'border-loss',
                  )}
                />
                {!inNewYork && target !== null && (
                  <span className="font-mono text-muted-foreground text-xs" data-testid="start-ny">
                    {format(new TZDate(target, SESSION_TZ), 'HH:mm')} NY
                  </span>
                )}
              </div>
            </label>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-[10.5px] text-muted-foreground uppercase tracking-wider">
                Kill zones on {format(new Date(day.y, day.m - 1, day.d), 'EEE d MMM')}
              </legend>
              <div className="grid grid-cols-2 gap-1.5">
                {zones.map((z) => {
                  const zoneMinute = pickOf(z.at, timezone).minute;
                  const on = minute === zoneMinute;
                  return (
                    <button
                      key={z.name}
                      type="button"
                      data-zone={z.name}
                      aria-pressed={on}
                      onClick={() => {
                        setError(null);
                        setClock(formatClock(zoneMinute));
                      }}
                      className={cn(
                        'grid rounded-md border px-2 py-1.5 text-left hover:bg-accent',
                        on && 'border-primary bg-primary/10 hover:bg-primary/15',
                      )}
                    >
                      <span className="font-semibold text-xs">{z.label}</span>
                      <span
                        className={cn(
                          'whitespace-nowrap font-mono text-[11px] text-muted-foreground',
                          on && 'text-primary',
                        )}
                      >
                        {formatClock(zoneMinute)}
                        {inNewYork ? '' : ` · ${format(new TZDate(z.at, SESSION_TZ), 'HH:mm')} NY`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed px-2 text-muted-foreground text-sm hover:bg-accent disabled:opacity-40"
              disabled={!data || busy !== null}
              onClick={random}
              title="Start at a random kill zone in your data"
            >
              {busy === 'random' ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Dices className="size-4" aria-hidden />
              )}
              Random
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed px-2 text-muted-foreground text-sm hover:bg-accent"
              onClick={onSelectBar}
              title="Close this and click a bar on the chart (B)"
            >
              <Scissors className="size-4 rotate-90" aria-hidden />
              Select bar on chart
            </button>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-3 mb-2 rounded-md border border-loss/40 bg-loss/10 px-2 py-1.5 text-loss text-xs"
          >
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2.5">
          <div className="grid min-w-0" data-testid="start-summary">
            <span className="truncate font-semibold text-sm">
              {format(new Date(day.y, day.m - 1, day.d), 'EEE d MMM yyyy')}
              {minute !== null ? `, ${formatClock(minute)}` : ''}
            </span>
            <span className="truncate text-[11px] text-muted-foreground">
              {dayWhy ?? (inFuture ? 'In the future' : same ? 'Same as your last start' : 'Enter to start')}
            </span>
          </div>
          <button
            type="submit"
            disabled={busy !== null || minute === null || !!dayWhy || inFuture}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 font-semibold text-primary-foreground text-sm disabled:opacity-50"
          >
            {busy === 'start' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : same && replaying ? (
              <RotateCcw className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {busy === 'start' ? 'Loading…' : same && replaying ? 'Restart' : 'Start'}
          </button>
        </div>
      </form>
    </>
  );
}
