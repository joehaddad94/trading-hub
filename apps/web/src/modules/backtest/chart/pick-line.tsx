'use client';

import { Play, Scissors, X } from 'lucide-react';
import type { PointerEvent } from 'react';
import { formatCursor, formatCursorShort } from './replay-time';

/**
 * TradingView's "Select bar" line: scissors on top, the bar's time on a flag at the bottom, the bars after it
 * dimmed. On phones the flag is a handle: drag it to move the line to another bar.
 */
export function PickLine({
  x,
  ts,
  pane,
  axis,
  timezone,
  draggable,
  onDrag,
}: {
  x: number;
  ts: number;
  /** Price pane height and price axis width, px. */
  pane: number;
  axis: number;
  timezone: string;
  draggable: boolean;
  /** Pointer x relative to the chart while the handle is dragged. */
  onDrag: (x: number) => void;
}) {
  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.offsetParent?.getBoundingClientRect();
    if (box && event.currentTarget.hasPointerCapture(event.pointerId)) onDrag(event.clientX - box.left);
  };
  return (
    <div aria-hidden={!draggable} className="pointer-events-none absolute inset-x-0 top-0" style={{ height: pane }}>
      <div className="absolute top-0 h-full bg-background/55" style={{ left: x, right: axis }} />
      <div className="absolute top-0 h-full w-px bg-primary" style={{ left: x }} data-testid="replay-pick-line" />
      <Scissors
        className="absolute top-1 size-4 -translate-x-1/2 rotate-90 text-primary"
        style={{ left: x }}
        aria-hidden
      />
      <button
        type="button"
        tabIndex={-1}
        className={`absolute bottom-1 -translate-x-1/2 touch-none whitespace-nowrap rounded bg-primary px-1.5 py-0.5 font-mono text-[11px] text-primary-foreground ${
          draggable ? 'pointer-events-auto cursor-ew-resize px-2.5 py-1.5' : ''
        }`}
        style={{ left: x }}
        data-testid="replay-pick-flag"
        onPointerDown={(event) => {
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={drag}
        onPointerUp={(event) => event.stopPropagation()}
      >
        {draggable ? '‹ ' : ''}
        {formatCursor(ts, timezone)}
        {draggable ? ' ›' : ''}
      </button>
    </div>
  );
}

/**
 * Top of the chart while picking a replay start. Desktop: how to pick and cancel. Phones, once a tap placed the
 * line: Start there or cancel, so a stray tap never restarts the replay.
 */
export function PickBar({
  placed,
  timezone,
  onStart,
  onCancel,
}: {
  /** Bar the line sits on (phones), or null before a tap. */
  placed: number | null;
  timezone: string;
  onStart: (barStart: number) => void;
  onCancel: () => void;
}) {
  if (placed === null) {
    return (
      <p
        role="status"
        className="pointer-events-none absolute top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border bg-popover px-3 py-1 text-xs shadow"
        data-testid="replay-pick-hint"
      >
        <span className="hidden md:inline">Click a bar to start replay · Esc or right-click to cancel</span>
        <span className="md:hidden">Tap a bar, then press Start</span>
      </p>
    );
  }
  return (
    <div
      role="toolbar"
      aria-label="Replay start"
      className="absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover p-1 shadow-lg"
    >
      <button
        type="button"
        className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-primary px-3 font-semibold text-primary-foreground text-sm"
        onClick={() => onStart(placed)}
      >
        <Play className="size-4" aria-hidden /> Start {formatCursorShort(placed, timezone)}
      </button>
      <button
        type="button"
        className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        aria-label="Cancel"
        onClick={onCancel}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
