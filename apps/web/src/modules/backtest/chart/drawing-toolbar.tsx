'use client';

import type { DrawingStyle } from '@trading/backtest';
import {
  Eye,
  EyeOff,
  Lock,
  LockOpen,
  type LucideIcon,
  Magnet,
  Minus,
  MousePointer2,
  Redo2,
  Ruler,
  Slash,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import { useDialogs } from '@/components/dialogs';
import { cn } from '@/lib/utils';
import { TOOLS } from './tools/registry';
import type { useDrawings } from './use-drawings';

type Drawings = ReturnType<typeof useDrawings>;

const COLOURS = ['#60a5fa', '#f87171', '#4ade80', '#facc15', '#a78bfa', '#f9fafb'];
const SHORT: Record<string, string> = { horizontal: 'H', trend: 'T', long: 'L', short: 'S', measure: 'M' };
/** TradingView-style tool icons. */
const ICONS: Record<string, LucideIcon> = {
  horizontal: Minus,
  trend: Slash,
  long: TrendingUp,
  short: TrendingDown,
  measure: Ruler,
};

const MAGNET_LABEL = { normal: 'Magnet off', weak_magnet: 'Weak magnet', strong_magnet: 'Strong magnet' } as const;
const NEXT_MAGNET = { normal: 'weak_magnet', weak_magnet: 'strong_magnet', strong_magnet: 'normal' } as const;

const tile =
  'flex size-10 shrink-0 compact:size-9 items-center justify-center rounded-md text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/15 aria-pressed:text-primary disabled:pointer-events-none disabled:opacity-40';

/** Left toolbar on desktop, a bottom row on phones (spec §4). */
export function DrawingToolbar({ drawings }: { drawings: Drawings }) {
  const dialogs = useDialogs();
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      className="relative flex shrink-0 gap-1 overflow-x-auto border-t p-1 compact:p-0.5 md:w-12 md:flex-col md:items-center md:overflow-x-hidden md:overflow-y-auto md:border-t-0 md:border-r"
    >
      <button
        type="button"
        className={tile}
        aria-pressed={drawings.active === null}
        onClick={drawings.cancel}
        title="Select (Esc)"
      >
        <MousePointer2 className="size-4" aria-hidden />
        <span className="sr-only">Select</span>
      </button>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={tile}
          aria-pressed={drawings.active === t.id}
          aria-keyshortcuts={`Alt+${SHORT[t.id]}`}
          title={`${t.label} (Alt+${SHORT[t.id]})`}
          onClick={() => drawings.start(t.id)}
        >
          <ToolIcon id={t.id} />
          <span className="sr-only">{t.label}</span>
        </button>
      ))}
      <div className="mx-1 w-px bg-border md:mx-0 md:my-1 md:h-px md:w-auto" />
      <button
        type="button"
        className={cn(tile, drawings.magnet === 'strong_magnet' && 'text-primary')}
        aria-pressed={drawings.magnet !== 'normal'}
        data-magnet={drawings.magnet}
        onClick={() => drawings.setMagnet(NEXT_MAGNET[drawings.magnet])}
        title={`${MAGNET_LABEL[drawings.magnet]} (click to change; hold Ctrl for a strong magnet)`}
      >
        <Magnet className="size-4" aria-hidden />
        <span className="sr-only">{MAGNET_LABEL[drawings.magnet]}</span>
      </button>
      <button
        type="button"
        className={tile}
        disabled={!drawings.canUndo}
        onClick={drawings.undo}
        aria-keyshortcuts="Control+Z"
        title="Undo drawing (Ctrl+Z)"
      >
        <Undo2 className="size-4" aria-hidden />
        <span className="sr-only">Undo drawing</span>
      </button>
      <button
        type="button"
        className={tile}
        disabled={!drawings.canRedo}
        onClick={drawings.redo}
        aria-keyshortcuts="Control+Y"
        title="Redo drawing (Ctrl+Y)"
      >
        <Redo2 className="size-4" aria-hidden />
        <span className="sr-only">Redo drawing</span>
      </button>
      <button
        type="button"
        className={tile}
        aria-pressed={drawings.hidden}
        onClick={() => drawings.setHidden(!drawings.hidden)}
        title={drawings.hidden ? 'Show drawings' : 'Hide drawings'}
      >
        {drawings.hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        <span className="sr-only">{drawings.hidden ? 'Show drawings' : 'Hide drawings'}</span>
      </button>
      <button
        type="button"
        className={tile}
        title="Delete all drawings"
        onClick={async () => {
          const ok = await dialogs.confirm({
            title: 'Delete all drawings?',
            message: 'Every drawing on this instrument will be removed.',
            confirmLabel: 'Delete all',
            tone: 'destructive',
          });
          if (ok) void drawings.removeAll();
        }}
      >
        <Trash2 className="size-4" aria-hidden />
        <span className="sr-only">Delete all drawings</span>
      </button>
    </div>
  );
}

function ToolIcon({ id }: { id: string }) {
  const Icon = ICONS[id];
  return Icon ? (
    <Icon className="size-[18px]" aria-hidden strokeWidth={1.8} />
  ) : (
    <span aria-hidden className="font-semibold">
      {SHORT[id]}
    </span>
  );
}

/** Properties of the selected drawing: colour, width, lock, tool options, delete. */
export function DrawingProperties({ drawings, children }: { drawings: Drawings; children?: React.ReactNode }) {
  const sel = drawings.selected;
  // Hidden while a tool is drawing: on a phone the bar would sit where the next click goes.
  if (!sel || drawings.active !== null) return null;
  const set = (style: Partial<DrawingStyle>) => drawings.restyle(sel.id, { style });
  return (
    <fieldset
      aria-label="Drawing properties"
      className="m-0 min-w-0 absolute bottom-2 left-1/2 z-10 flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center gap-1 rounded-md border bg-popover/95 p-1 text-xs shadow-md"
    >
      {COLOURS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          aria-pressed={sel.style.color === c}
          onClick={() => set({ color: c })}
          className="size-7 rounded-sm border-2 border-transparent aria-pressed:border-foreground"
          style={{ backgroundColor: c }}
        />
      ))}
      <select
        aria-label="Line width"
        value={sel.style.width}
        onChange={(e) => set({ width: Number(e.target.value) })}
        className="h-8 rounded-md border bg-background px-1"
      >
        {[1, 2, 3, 4].map((w) => (
          <option key={w} value={w}>
            {w}px
          </option>
        ))}
      </select>
      {sel.tool === 'trend' && (
        <select
          aria-label="Extend"
          value={sel.style.extend ?? 'none'}
          onChange={(e) => set({ extend: e.target.value as DrawingStyle['extend'] })}
          className="h-8 rounded-md border bg-background px-1"
        >
          <option value="none">No extension</option>
          <option value="right">Extend right</option>
          <option value="left">Extend left</option>
          <option value="both">Extend both</option>
        </select>
      )}
      {sel.tool === 'horizontal' && (
        <input
          aria-label="Label"
          placeholder="Label"
          defaultValue={sel.label ?? ''}
          key={sel.id}
          maxLength={80}
          onBlur={(e) => drawings.restyle(sel.id, { label: e.target.value.trim() || null })}
          className="h-8 w-28 rounded-md border bg-background px-1"
        />
      )}
      {children}
      <button
        type="button"
        className={cn('flex size-8 items-center justify-center rounded-md hover:bg-accent/60')}
        aria-pressed={sel.style.lock}
        aria-label={sel.style.lock ? 'Unlock' : 'Lock'}
        onClick={() => set({ lock: !sel.style.lock })}
      >
        {sel.style.lock ? <Lock className="size-4" aria-hidden /> : <LockOpen className="size-4" aria-hidden />}
      </button>
      <button
        type="button"
        className="flex size-8 items-center justify-center rounded-md text-loss hover:bg-accent/60"
        aria-label="Delete drawing"
        onClick={drawings.removeSelected}
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </fieldset>
  );
}
