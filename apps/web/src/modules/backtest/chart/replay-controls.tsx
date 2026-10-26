'use client';

import { pickTime, SPEEDS, type Speed, type StartPick } from '@trading/backtest-engine';
import { CalendarDays, Pause, Play, Scissors, StepBack, StepForward, X } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { readLastStart } from './last-start';
import { initialPick, ReplayStartPanel } from './replay-start-panel';
import { formatCursor, formatCursorShort } from './replay-time';
import { RESTART_BLOCKED, type useReplay } from './use-replay';

type Replay = ReturnType<typeof useReplay>;

const button =
  'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent/60 disabled:opacity-50 compact:px-1.5';

/** Button text shown from tablet width up; phones (either way round) get the icon and the aria-label. */
function Label({ children }: { children: string }) {
  return <span className="hidden sm:inline short:hidden!">{children}</span>;
}

/** Replay bar (spec §3.1): start from the start panel or a clicked bar, step back and forward, play, exit. */
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
  /** Open: the last start (ms) the panel was opened with, so it labels Start as Restart when nothing changed. */
  const [panel, setPanel] = useState<{ lastStart: number | null } | null>(null);
  const toggle = () => {
    // An open or pending trade keeps the replay on its time: say why instead of offering other dates.
    if (!panel && back.blocked) replay.notify(RESTART_BLOCKED);
    else setPanel(panel ? null : { lastStart: readLastStart() });
  };

  // TradingView's "Select bar", before and during replay: a line follows the pointer, a click starts there. Phones
  // get the icon only in replay, so it fits the row next to the step buttons (Joe: usable at any time).
  const selectBar = (
    <button
      type="button"
      className={cn(button, picking && 'bg-accent text-accent-foreground')}
      aria-pressed={picking}
      aria-label="Select bar"
      aria-keyshortcuts="B"
      title="Select bar: start the replay from a bar on the chart (B)"
      onClick={() => onPick(!picking)}
    >
      <Scissors className="size-4 rotate-90" aria-hidden />
      {replay.cursor === null ? <span>Select bar</span> : <Label>Select bar</Label>}
    </button>
  );

  const startPanel = panel && (
    <ReplayStartPanel
      timezone={timezone}
      data={data}
      initial={initialPick(panel.lastStart, replay.cursor, timezone, data, Date.now())}
      lastStart={panel.lastStart}
      replaying={replay.cursor !== null}
      onStart={async (pick: StartPick) => {
        const target = pickTime(pick, timezone);
        const result = await replay.startFrom(target);
        if (!result.ok) return result.error;
        if (result.snapped) {
          replay.notify(`Market closed then. Started at the next candle, ${formatCursor(result.cursor, timezone)}.`);
        }
        return null;
      }}
      onSelectBar={() => {
        setPanel(null);
        onPick(true);
      }}
      onClose={() => setPanel(null)}
    />
  );

  if (replay.cursor === null) {
    return (
      <div
        className={cn(
          'relative flex flex-wrap items-center gap-2 border-b px-2 py-1.5 text-sm compact:py-0.5 short:min-w-0 short:flex-1 md:px-4',
          panel ? 'z-40' : 'z-20',
        )}
        role="toolbar"
        aria-label="Start replay"
      >
        <button
          type="button"
          className={cn(button, 'bg-accent text-accent-foreground')}
          aria-expanded={!!panel}
          aria-haspopup="dialog"
          onClick={toggle}
        >
          <CalendarDays className="size-4" aria-hidden /> Start replay
        </button>
        {selectBar}
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
    <div className={cn('relative short:min-w-0 short:flex-1', panel ? 'z-40' : 'z-20')}>
      {/* Phones: one row, icons only, short time, so the chart keeps its height. Exit stays pinned on the right
        if the row ever has to scroll. */}
      <div
        className="flex flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap border-b px-2 py-1.5 text-sm compact:py-0.5 md:flex-wrap md:px-4 short:flex-nowrap!"
        role="toolbar"
        aria-label="Replay"
      >
        <span className="mr-1 shrink-0 font-medium num" data-testid="replay-cursor" data-cursor={replay.cursor}>
          <span className="hidden sm:inline short:hidden!">{formatCursor(replay.cursor, timezone)}</span>
          <span className="sm:hidden short:inline!">{formatCursorShort(replay.cursor, timezone)}</span>
        </span>
        <button
          type="button"
          className={button}
          aria-expanded={!!panel}
          aria-haspopup="dialog"
          aria-label="Change replay date"
          title="Replay from another date"
          onClick={toggle}
        >
          <CalendarDays className="size-4" aria-hidden />
        </button>
        {selectBar}
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
        <button
          type="button"
          className={cn(button, 'sticky right-0 ml-auto bg-background')}
          onClick={replay.exit}
          aria-label="Exit replay"
        >
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
