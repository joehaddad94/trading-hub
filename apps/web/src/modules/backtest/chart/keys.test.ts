import { describe, expect, it } from 'vitest';
import { chartKeyFor } from './keys';

const press = (key: string, mods: Partial<Record<'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey', boolean>> = {}) => ({
  key,
  code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  ...mods,
});

describe('chartKeyFor', () => {
  it('uses TradingView’s replay keys: Shift+→ steps a bar, Shift+↓ plays', () => {
    expect(chartKeyFor(press('ArrowRight', { shiftKey: true }), true)).toEqual({ type: 'step', mode: 'bar' });
    expect(chartKeyFor(press('ArrowRight'), true)).toEqual({ type: 'step', mode: 'bar' });
    expect(chartKeyFor(press('ArrowDown', { shiftKey: true }), true)).toEqual({ type: 'play' });
    expect(chartKeyFor(press(' '), true)).toEqual({ type: 'play' });
  });

  it('steps a minute with Alt and goes back with ←', () => {
    expect(chartKeyFor(press('ArrowRight', { altKey: true }), true)).toEqual({ type: 'step', mode: 'minute' });
    expect(chartKeyFor(press('ArrowLeft', { altKey: true }), true)).toEqual({ type: 'back', mode: 'minute' });
    expect(chartKeyFor(press('ArrowLeft'), true)).toEqual({ type: 'back', mode: 'bar' });
    expect(chartKeyFor(press('ArrowLeft', { shiftKey: true }), true)).toEqual({ type: 'back', mode: 'bar' });
  });

  it('scrolls and zooms outside replay', () => {
    expect(chartKeyFor(press('ArrowRight'), false)).toEqual({ type: 'scroll', bars: 1 });
    expect(chartKeyFor(press('ArrowLeft'), false)).toEqual({ type: 'scroll', bars: -1 });
    expect(chartKeyFor(press('ArrowUp'), false)).toEqual({ type: 'zoom', in: true });
    expect(chartKeyFor(press('ArrowDown'), true)).toEqual({ type: 'zoom', in: false });
    expect(chartKeyFor(press(' '), false)).toBeNull();
    expect(chartKeyFor(press('ArrowDown', { shiftKey: true }), false)).toBeNull();
  });

  it('resets with Alt+R and undoes with Ctrl or ⌘', () => {
    expect(chartKeyFor(press('r', { altKey: true }), false)).toEqual({ type: 'reset' });
    expect(chartKeyFor(press('z', { ctrlKey: true }), true)).toEqual({ type: 'undo' });
    expect(chartKeyFor(press('z', { metaKey: true, shiftKey: true }), true)).toEqual({ type: 'redo' });
    expect(chartKeyFor(press('y', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
    expect(chartKeyFor(press('ArrowRight', { ctrlKey: true }), true)).toBeNull();
    expect(chartKeyFor(press('5'), true)).toBeNull();
  });
});
