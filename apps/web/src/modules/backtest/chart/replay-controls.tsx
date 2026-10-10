'use client';

import { SPEEDS, type Speed } from '@trading/backtest-engine';
import { FastForward, Pause, Play, SkipForward, StepForward, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCursor, localInputToUtc } from './replay-time';
import type { useReplay } from './use-replay';

type Replay = ReturnType<typeof useReplay>;

const button =
  'inline-flex h-9 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent/60 disabled:opacity-50';

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

  if (replay.cursor === null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm md:px-4"
        aria-label="Start replay"
        onSubmit={(e) => {
          e.preventDefault();
          const at = localInputToUtc(when, timezone);
          if (at !== null) replay.start(at);
        }}
      >
        <label className="flex items-center gap-2 text-muted-foreground">
          Replay from
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="h-9 rounded-md border bg-background px-2 text-foreground"
            aria-label="Replay start"
          />
        </label>
        <button type="submit" className={cn(button, 'bg-accent text-accent-foreground')} disabled={!when}>
          <Play className="size-4" aria-hidden /> Start
        </button>
        <button type="button" className={button} aria-pressed={picking} onClick={() => onPick(!picking)}>
          {picking ? 'Click a candle…' : 'Start replay here'}
        </button>
      </form>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5 text-sm md:px-4"
      role="toolbar"
      aria-label="Replay"
    >
      <span className="mr-1 font-medium tabular-nums" data-testid="replay-cursor" data-cursor={replay.cursor}>
        {formatCursor(replay.cursor, timezone)}
      </span>
      <button
        type="button"
        className={button}
        onClick={() => replay.setPlaying(!replay.playing)}
        aria-keyshortcuts="Space"
      >
        {replay.playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        {replay.playing ? 'Pause' : 'Play'}
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
      <button type="button" className={button} onClick={() => void replay.step('bar')} aria-keyshortcuts="ArrowRight">
        <StepForward className="size-4" aria-hidden /> Bar
      </button>
      <button
        type="button"
        className={button}
        onClick={() => void replay.step('minute')}
        aria-keyshortcuts="Shift+ArrowRight"
      >
        +1m
      </button>
      <button type="button" className={button} onClick={() => replay.jump('session')}>
        <SkipForward className="size-4" aria-hidden /> Next session
      </button>
      <button type="button" className={button} onClick={() => replay.jump('day')}>
        <FastForward className="size-4" aria-hidden /> Next day
      </button>
      <button type="button" className={cn(button, 'ml-auto')} onClick={replay.exit}>
        <X className="size-4" aria-hidden /> Exit replay
      </button>
      {replay.message && (
        <p role="status" className="w-full text-muted-foreground text-xs">
          {replay.message}
        </p>
      )}
    </div>
  );
}
