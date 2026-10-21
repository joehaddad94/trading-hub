'use client';

import { SPEEDS, type Speed } from '@trading/backtest-engine';
import { CalendarDays, FastForward, Pause, Play, SkipForward, StepForward, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { defaultReplayStart, formatCursor, formatCursorShort, localInputToUtc, utcToLocalInput } from './replay-time';
import type { useReplay } from './use-replay';

type Replay = ReturnType<typeof useReplay>;

const button =
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent/60 disabled:opacity-50';

/** Button text shown from tablet width up; phones get the icon and the aria-label. */
function Label({ children }: { children: string }) {
  return <span className="hidden sm:inline">{children}</span>;
}

/** Replay bar (spec §3.1): start at a date/time or a clicked bar, step, play, jump, exit. No step back. */
export function ReplayControls({
  replay,
  timezone,
  picking,
  onPick,
}: {
  replay: Replay;
  timezone: string;
  picking: boolean;
  onPick: (on: boolean) => void;
}) {
  const [when, setWhen] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  /** Replaying: the date field is open to jump to another start without leaving replay. */
  const [changing, setChanging] = useState(false);
  // Prefilled after mount (the server doesn't know "now" the same way), so Start always does something.
  useEffect(() => setWhen((w) => w || utcToLocalInput(defaultReplayStart(Date.now()), timezone)), [timezone]);

  if (replay.cursor === null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm md:px-4"
        aria-label="Start replay"
        onSubmit={(e) => {
          e.preventDefault();
          const at = localInputToUtc(when, timezone);
          if (at === null) {
            setHint('Pick a date and time first, or use Start replay here and click a candle.');
            return;
          }
          setHint(null);
          replay.start(at);
        }}
      >
        <label className="flex items-center gap-2 text-muted-foreground">
          <span className="hidden sm:inline">Replay from</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value);
              setHint(null);
            }}
            className="h-9 rounded-md border bg-background px-2 text-foreground"
            aria-label="Replay start"
          />
        </label>
        <button type="submit" className={cn(button, 'bg-accent text-accent-foreground')}>
          <Play className="size-4" aria-hidden /> Start
        </button>
        <button type="button" className={button} aria-pressed={picking} onClick={() => onPick(!picking)}>
          {picking ? 'Click a candle…' : 'Start replay here'}
        </button>
        {hint && (
          <p role="alert" className="text-warning">
            {hint}
          </p>
        )}
      </form>
    );
  }

  return (
    // Phones: one row that scrolls sideways, icons only, short time — so the chart keeps its height.
    <div
      className="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap border-b px-2 py-1.5 text-sm md:flex-wrap md:px-4"
      role="toolbar"
      aria-label="Replay"
    >
      <span className="mr-1 shrink-0 font-medium num" data-testid="replay-cursor" data-cursor={replay.cursor}>
        <span className="hidden sm:inline">{formatCursor(replay.cursor, timezone)}</span>
        <span className="sm:hidden">{formatCursorShort(replay.cursor, timezone)}</span>
      </span>
      <button
        type="button"
        className={button}
        aria-expanded={changing}
        aria-label="Change replay date"
        title="Replay from another date"
        onClick={() => {
          if (!changing && replay.cursor !== null) setWhen(utcToLocalInput(replay.cursor, timezone));
          setHint(null);
          setChanging(!changing);
        }}
      >
        <CalendarDays className="size-4" aria-hidden />
      </button>
      {changing && (
        <form
          className="flex shrink-0 items-center gap-1"
          aria-label="Change replay date"
          onSubmit={(e) => {
            e.preventDefault();
            const at = localInputToUtc(when, timezone);
            if (at === null) {
              setHint('Pick a date and time first.');
              return;
            }
            setHint(null);
            setChanging(false);
            replay.start(at);
          }}
        >
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => {
              setWhen(e.target.value);
              setHint(null);
            }}
            className="h-9 rounded-md border bg-background px-2 text-foreground"
            aria-label="New replay start"
          />
          <button type="submit" className={cn(button, 'bg-accent text-accent-foreground')}>
            Go
          </button>
          {hint && (
            <span role="alert" className="text-warning">
              {hint}
            </span>
          )}
        </form>
      )}
      <button
        type="button"
        className={button}
        onClick={() => replay.setPlaying(!replay.playing)}
        aria-keyshortcuts="Space"
        aria-label={replay.playing ? 'Pause' : 'Play'}
      >
        {replay.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        <Label>{replay.playing ? 'Pause' : 'Play'}</Label>
      </button>
      <label className="flex items-center text-muted-foreground">
        <span className="sr-only">Speed</span>
        <select
          value={replay.speed}
          onChange={(e) => replay.setSpeed(Number(e.target.value) as Speed)}
          className="h-9 rounded-md border bg-background px-1 text-foreground"
          aria-label="Bars per second"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className={button}
        onClick={() => void replay.step('bar')}
        aria-keyshortcuts="ArrowRight"
        aria-label="Bar"
      >
        <StepForward className="size-4" aria-hidden /> <Label>Bar</Label>
      </button>
      <button
        type="button"
        className={button}
        onClick={() => void replay.step('minute')}
        aria-keyshortcuts="Shift+ArrowRight"
      >
        +1m
      </button>
      <button type="button" className={button} onClick={() => void replay.jump('session')} aria-label="Next session">
        <SkipForward className="size-4" aria-hidden /> <Label>Next session</Label>
      </button>
      <button type="button" className={button} onClick={() => void replay.jump('day')} aria-label="Next day">
        <FastForward className="size-4" aria-hidden /> <Label>Next day</Label>
      </button>
      <button type="button" className={cn(button, 'ml-auto')} onClick={replay.exit} aria-label="Exit replay">
        <X className="size-4" aria-hidden /> <Label>Exit replay</Label>
      </button>
      {replay.message && (
        <p role="status" className="w-full text-muted-foreground text-xs">
          {replay.message}
        </p>
      )}
    </div>
  );
}
