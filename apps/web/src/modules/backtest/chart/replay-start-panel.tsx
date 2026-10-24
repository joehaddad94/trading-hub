'use client';

import { TZDate } from '@date-fns/tz';
import {
  addDays,
  type CalendarDay,
  dayBlocked,
  dayOf,
  monthGrid,
  randomStart,
  type StartPick,
  sameDay,
  timeOn,
  type Zone,
  zonesOnDay,
} from '@trading/backtest-engine';
import { SESSION_TZ } from '@trading/core';
import { isTradingHours } from '@trading/market-data';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Dices, Loader2, X } from 'lucide-react';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

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
 * Replay start panel (backtester spec §3.1, Joe 24 Oct 2026: fast and easy). Pick a day (closed and no-data days
 * are greyed out), then a kill zone, and the replay starts. Random starts at a random kill zone in the data.
 * A popover on desktop, a bottom sheet on phones.
 */
export function ReplayStartPanel({
  timezone,
  data,
  initialAt,
  replaying,
  onStart,
  onClose,
}: {
  timezone: string;
  data: Data;
  /** Day the panel opens on: the replay cursor, or a week back. */
  initialAt: number;
  replaying: boolean;
  /** Starts the replay; resolves to an error message, or null once it started. */
  onStart: (pick: StartPick) => Promise<string | null>;
  onClose: () => void;
}) {
  const now = useMemo(() => Date.now(), []);
  const [day, setDay] = useState(() => openDayAtOrBefore(dayOf(initialAt, timezone), timezone, data, now));
  const [view, setView] = useState({ y: day.y, m: day.m });
  const [busy, setBusy] = useState<Zone | 'random' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const blocked = (d: CalendarDay) => dayBlocked(d, timezone, data, now, isTradingHours);

  const choose = (d: CalendarDay) => {
    setError(null);
    setDay(d);
    setView({ y: d.y, m: d.m });
  };

  const start = async (pick: StartPick, which: Zone | 'random') => {
    if (busy) return;
    setBusy(which);
    setError(null);
    const failed = await onStart(pick);
    setBusy(null);
    if (failed) setError(failed);
    else onClose();
  };

  const random = () => {
    const pick = data ? randomStart(data.from, data.to, Math.random, timezone, isTradingHours) : null;
    if (!pick) {
      setError('Not enough candles for a random start yet.');
      return;
    }
    choose(pick.day);
    void start(pick, 'random');
  };

  // Arrow keys move the day; closed days are skipped over.
  const onGridKey = (e: KeyboardEvent) => {
    const by = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (by === undefined) return;
    e.preventDefault();
    let next = addDays(day, by);
    for (let i = 0; i < 7 && blocked(next); i += 1) next = addDays(next, Math.sign(by));
    if (blocked(next)) return;
    choose(next);
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${next.y}-${next.m}-${next.d}"]`)?.focus(),
    );
  };

  const monthStart = timeOn({ y: view.y, m: view.m, d: 1 }, 0, timezone);
  const nextMonth = view.m === 12 ? { y: view.y + 1, m: 1 } : { y: view.y, m: view.m + 1 };
  const canPrev = !data || monthStart > data.from;
  const canNext = timeOn({ ...nextMonth, d: 1 }, 0, timezone) <= now;
  const inNewYork = timezone === SESSION_TZ;
  const dayOpen = !blocked(day);

  return (
    <>
      <button
        type="button"
        aria-label="Close start panel"
        tabIndex={-1}
        className="fixed inset-0 z-40 cursor-default bg-black/50 md:bg-transparent"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label={replaying ? 'Replay from another date' : 'Start replay'}
        data-testid="replay-start-panel"
        className={cn(
          'fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-50 max-h-[80dvh] overflow-y-auto rounded-t-xl border-t bg-popover text-popover-foreground shadow-2xl',
          'md:absolute md:inset-x-auto md:top-full md:bottom-auto md:left-2 md:mt-1 md:max-h-none md:w-[34rem] md:rounded-lg md:border',
        )}
        // Keep the chart's shortcuts (timeframe keys, replay steps) out while choosing.
        onKeyDown={(e) => {
          if (e.key !== 'Escape') e.stopPropagation();
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

        <div className="grid gap-4 p-3 md:grid-cols-[1fr_13rem]">
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
                return (
                  <button
                    key={`${d.y}-${d.m}-${d.d}`}
                    type="button"
                    data-day={`${d.y}-${d.m}-${d.d}`}
                    disabled={!!why}
                    title={why ?? undefined}
                    aria-pressed={selected}
                    aria-label={`${format(new Date(d.y, d.m - 1, d.d), 'EEEE d MMMM yyyy')}${why ? `, ${why.toLowerCase()}` : ''}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => choose(d)}
                    className={cn(
                      'h-9 rounded-md font-mono num md:h-8',
                      why ? 'cursor-not-allowed text-muted-foreground/35' : 'hover:bg-accent',
                      selected && !why && 'bg-primary font-semibold text-primary-foreground hover:bg-primary',
                    )}
                  >
                    {d.d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid content-start gap-2">
            <span className="text-[10.5px] text-muted-foreground uppercase tracking-wider">
              {format(new Date(day.y, day.m - 1, day.d), 'EEE d MMM')} · start at
            </span>
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
              {zonesOnDay(day, timezone).map((z) => (
                <button
                  key={z.name}
                  type="button"
                  data-zone={z.name}
                  disabled={!dayOpen || busy !== null}
                  onClick={() => void start({ day, zone: z.name }, z.name)}
                  className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                >
                  <span className="font-semibold text-sm">{z.label}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {busy === z.name ? (
                      <Loader2 className="size-3.5 animate-spin" aria-label="Loading" />
                    ) : (
                      <>
                        {format(new TZDate(z.at, timezone), 'HH:mm')}
                        {inNewYork ? '' : ` · ${format(new TZDate(z.at, SESSION_TZ), 'HH:mm')} NY`}
                      </>
                    )}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="mt-1 inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-dashed px-2 text-muted-foreground text-sm hover:bg-accent disabled:opacity-40"
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
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mx-3 mb-3 rounded-md border border-loss/40 bg-loss/10 px-2 py-1.5 text-loss text-xs"
          >
            {error}
          </p>
        )}
      </div>
    </>
  );
}
