import type { StepMode } from '@trading/backtest-engine';

/** What a key press on the chart does. Timeframe keys and drawing tools are handled separately. */
export type ChartKey =
  | { type: 'step'; mode: StepMode }
  | { type: 'back'; mode: StepMode }
  | { type: 'play' }
  | { type: 'scroll'; bars: number }
  | { type: 'zoom'; in: boolean }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' };

type Press = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey'>;

/**
 * TradingView's keys (Bar Replay hotkeys post, 23 Oct 2026 audit): Shift+→ steps a bar and Shift+↓ plays or
 * pauses; → and Space do the same. Alt+→ / Alt+← step one minute (Joe's call, 23 Oct). ← steps back a bar.
 * Outside replay the arrows scroll the chart a bar; ↑/↓ zoom; Alt+R resets the chart; Ctrl/⌘+Z and Ctrl/⌘+Y
 * (or Ctrl/⌘+Shift+Z) undo and redo drawings.
 */
export function chartKeyFor(e: Press, replaying: boolean): ChartKey | null {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !e.altKey) {
    if (e.code === 'KeyZ') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    if (e.code === 'KeyY') return { type: 'redo' };
    return null;
  }
  if (mod) return null;
  if (e.altKey && !e.shiftKey && e.code === 'KeyR') return { type: 'reset' };
  const mode: StepMode = e.altKey ? 'minute' : 'bar';
  switch (e.key) {
    case 'ArrowRight':
      return replaying ? { type: 'step', mode } : e.altKey ? null : { type: 'scroll', bars: 1 };
    case 'ArrowLeft':
      return replaying ? { type: 'back', mode } : e.altKey ? null : { type: 'scroll', bars: -1 };
    case 'ArrowDown':
      if (e.altKey) return null;
      return e.shiftKey ? (replaying ? { type: 'play' } : null) : { type: 'zoom', in: false };
    case 'ArrowUp':
      return e.altKey || e.shiftKey ? null : { type: 'zoom', in: true };
    case ' ':
      return replaying && !e.altKey && !e.shiftKey ? { type: 'play' } : null;
    default:
      return null;
  }
}
