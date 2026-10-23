import type { Drawing } from '@trading/backtest';
import { describe, expect, it } from 'vitest';
import { DrawingHistory, inverse } from './drawing-history';

const drawing = (id: string, price = 100): Drawing => ({
  id,
  instrument: 'US30',
  sessionId: null,
  tool: 'horizontal',
  points: [{ ts: 1, price }],
  style: { color: '#60a5fa', width: 1, lock: false },
  label: null,
});
const input = (price: number) => {
  const { id: _id, instrument: _i, sessionId: _s, ...rest } = drawing('x', price);
  return rest;
};

describe('DrawingHistory', () => {
  it('undoes a create by removing it and redoes it by creating it again', () => {
    const h = new DrawingHistory();
    const ref = h.ref('a');
    h.record({ kind: 'create', ref, drawing: drawing('a') });
    expect(h.undo()).toMatchObject({ kind: 'remove', ref });
    expect(h.canUndo).toBe(false);
    expect(h.redo()).toMatchObject({ kind: 'create', ref });
    expect(h.redo()).toBeNull();
  });

  it('swaps before and after to undo a move', () => {
    const h = new DrawingHistory();
    h.record({ kind: 'update', ref: h.ref('a'), before: input(100), after: input(120) });
    expect(h.undo()).toMatchObject({ before: input(120), after: input(100) });
  });

  it('keeps later steps pointing at a drawing re-created with a new id', () => {
    const h = new DrawingHistory();
    const ref = h.ref('a');
    h.record({ kind: 'update', ref, before: input(100), after: input(120) });
    h.record({ kind: 'remove', ref, drawing: drawing('a', 120) });
    h.undo(); // re-creates it
    h.rename(ref, 'b');
    const undoMove = h.undo();
    expect(undoMove?.kind === 'update' && undoMove.ref.id).toBe('b');
    expect(h.ref('b')).toBe(ref);
  });

  it('a new change clears redo', () => {
    const h = new DrawingHistory();
    h.record({ kind: 'create', ref: h.ref('a'), drawing: drawing('a') });
    h.undo();
    h.record({ kind: 'create', ref: h.ref('c'), drawing: drawing('c') });
    expect(h.canRedo).toBe(false);
  });

  it('undoes a batch in reverse order', () => {
    const changes = [
      { kind: 'remove' as const, ref: { id: 'a' }, drawing: drawing('a') },
      { kind: 'remove' as const, ref: { id: 'b' }, drawing: drawing('b') },
    ];
    const undo = inverse({ kind: 'batch', changes });
    expect(undo.kind === 'batch' && undo.changes.map((c) => (c.kind === 'create' ? c.ref.id : ''))).toEqual(['b', 'a']);
  });
});
