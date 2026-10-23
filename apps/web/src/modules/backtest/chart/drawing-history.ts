import type { Drawing, DrawingInput } from '@trading/backtest';

/**
 * One drawing across undo and redo. Re-creating a deleted drawing gives it a new database id, so every history
 * entry for that drawing shares this object and sees the new id.
 */
export type DrawingRef = { id: string };

/** A change to the drawings that Ctrl+Z can take back (TradingView's undo, audit #07). */
export type DrawingChange =
  | { kind: 'create'; ref: DrawingRef; drawing: Drawing }
  | { kind: 'remove'; ref: DrawingRef; drawing: Drawing }
  | { kind: 'update'; ref: DrawingRef; before: DrawingInput; after: DrawingInput }
  | { kind: 'batch'; changes: DrawingChange[] };

/** The change that undoes `change`. */
export function inverse(change: DrawingChange): DrawingChange {
  switch (change.kind) {
    case 'create':
      return { ...change, kind: 'remove' };
    case 'remove':
      return { ...change, kind: 'create' };
    case 'update':
      return { ...change, before: change.after, after: change.before };
    case 'batch':
      return { kind: 'batch', changes: [...change.changes].reverse().map(inverse) };
  }
}

/** Steps kept; older ones drop off. */
export const HISTORY_LIMIT = 100;

/** Undo and redo stacks; a new change clears redo, as everywhere. */
export class DrawingHistory {
  private done: DrawingChange[] = [];
  private undone: DrawingChange[] = [];
  private refs = new Map<string, DrawingRef>();

  /** The shared ref for a drawing id (created on first use). */
  ref(id: string): DrawingRef {
    let ref = this.refs.get(id);
    if (!ref) {
      ref = { id };
      this.refs.set(id, ref);
    }
    return ref;
  }

  /** A re-created drawing got a new id: every entry that names it follows. */
  rename(ref: DrawingRef, id: string): void {
    this.refs.delete(ref.id);
    ref.id = id;
    this.refs.set(id, ref);
  }

  record(change: DrawingChange): void {
    this.done.push(change);
    if (this.done.length > HISTORY_LIMIT) this.done.shift();
    this.undone = [];
  }

  /** The change to apply to undo the last one, or null. */
  undo(): DrawingChange | null {
    const last = this.done.pop();
    if (!last) return null;
    this.undone.push(last);
    return inverse(last);
  }

  /** The change to apply to redo the last undone one, or null. */
  redo(): DrawingChange | null {
    const next = this.undone.pop();
    if (!next) return null;
    this.done.push(next);
    return next;
  }

  clear(): void {
    this.done = [];
    this.undone = [];
    this.refs.clear();
  }

  get canUndo(): boolean {
    return this.done.length > 0;
  }

  get canRedo(): boolean {
    return this.undone.length > 0;
  }
}
