'use client';

import { MINUTE_MS, pickTime, SPEEDS, type Speed, type StartPick } from '@trading/backtest-engine';
import { CalendarDays, Crosshair, FastForward, Pause, Play, SkipForward, StepBack, StepForward, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ReplayStartPanel } from './replay-start-panel';
import { defaultReplayStart, formatCursor, formatCursorShort } from './replay-time';
import type { useReplay } from './use-replay';

type Replay = ReturnType<typeof useReplay>;

const button =
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent/60 disabled:opacity-50';

/** Button text shown from tablet width up; phones get the icon and the aria-label. */
function Label({ children }: { children: string }) {
  return <span className="hidden sm:inline">{children}</span>;
}

/** Replay bar (spec §3.1): start from the start panel or a clicked bar, step back and forward, play, jump, exit. */
export function ReplayControls({
  replay,
  timezone,
  data,
  picking,
  onPick,
  back,
}: {
  replay: Replay;
  timezone: string;
  /** First and last candle of the instrument (ms), or null when unknown. */
  data: { from: number; to: number } | null;
  picking: boolean;
  onPick: (on: boolean) => void;
  /** Step back: why it is blocked (or null) and the earliest cursor allowed. */
  back: { blocked: string | null; floor: number | null };
}) {
  const [panel, setPanel] = useState(false);

  const startPanel = panel && (
    <ReplayStartPanel
      timezone={timezone}
      data={data}
      initialAt={replay.cursor ?? defaultReplayStart(Date.now())}
      replaying={replay.cursor !== null}
      onStart={async (pick: StartPick) => {
        const target = pickTime(pick, timezone);
        if (target === null) return 'That kill zone does not open on this day.';
        const result = await replay.startFrom(target);
        if (!result.ok) return result.error;
        if (result.snapped) {
          replay.notify(
            `Market closed then. Started at the next candle, ${formatCursor(result.cursor + MINUTE_MS, timezone)}.`,
          );
        }
        return null;
      }}
      onClose={() => setPanel(false)}
    />
  );

  if (replay.cursor === null) {
    return (
      <div
        className="relative z-20 flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm md:px-4"
        role="toolbar"
        aria-label="Start replay"
      >
        <button
          type="button"
          className={cn(button, 'bg-accent text-accent-foreground')}
          aria-expanded={panel}
          aria-haspopup="dialog"
          onClick={() => setPanel(!panel)}
        >
          <CalendarDays className="size-4" aria-hidden /> Start replay
        </button>
        <button type="button" className={button} aria-pressed={picking} onClick={() => onPick(!picking)}>
          <Crosshair className="size-4" aria-hidden /> {picking ? 'Click a candle…' : 'Select bar'}
        </button>
        {replay.message && (
          <p role="status" className="text-muted-foreground text-xs">
            {replay.message}
          </p>
        )}
        {startPanel}
      </div>
    );
  }

  return (
    <div className="relative z-20">
      {/* Phones: one row that scrolls sideways, icons only, short time — so the chart keeps its height. */}
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
          aria-expanded={panel}
          aria-haspopup="dialog"
          aria-label="Change replay date"
          title="Replay from another date"
          onClick={() => setPanel(!panel)}
        >
          <CalendarDays className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => replay.setPlaying(!replay.playing)}
          aria-keyshortcuts="Shift+ArrowDown Space"
          aria-label={replay.playing ? 'Pause' : 'Play'}
          title={`${replay.playing ? 'Pause' : 'Play'} (Shift+↓ or Space)`}
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
          onClick={() => void replay.stepBack('bar', back)}
          aria-keyshortcuts="ArrowLeft"
          aria-label="Bar back"
          title={back.blocked ?? 'One bar back (←, Alt+← one minute)'}
        >
          <StepBack className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          className={button}
          onClick={() => void replay.step('bar')}
          aria-keyshortcuts="Shift+ArrowRight ArrowRight"
          aria-label="Bar"
          title="One bar forward (Shift+→ or →)"
        >
          <StepForward className="size-4" aria-hidden /> <Label>Bar</Label>
        </button>
        <button
          type="button"
          className={button}
          onClick={() => void replay.step('minute')}
          aria-keyshortcuts="Alt+ArrowRight"
          title="One minute forward (Alt+→)"
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
      </div>
      {replay.message && (
        <p role="status" className="border-b px-2 py-1 text-muted-foreground text-xs md:px-4">
          {replay.message}
        </p>
      )}
      {startPanel}
    </div>
  );
}
