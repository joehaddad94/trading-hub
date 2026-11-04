import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseThemeChoice, resolveTheme, THEME_SCRIPT } from './theme';

describe('parseThemeChoice', () => {
  it('keeps a known choice and falls back to system', () => {
    expect(parseThemeChoice('light')).toBe('light');
    expect(parseThemeChoice('dark')).toBe('dark');
    expect(parseThemeChoice('system')).toBe('system');
    expect(parseThemeChoice('sepia')).toBe('system');
    expect(parseThemeChoice(null)).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS only for system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('THEME_SCRIPT', () => {
  type Listener = () => void;
  let classes: Set<string>;
  let html: { classList: unknown; style: Record<string, string>; dataset: Record<string, string> };
  let stored: string | null;
  let systemDark: boolean;
  let listeners: Record<string, Listener[]>;
  let meta: { content: string; setAttribute: (k: string, v: string) => void; removeAttribute: () => void };

  beforeEach(() => {
    classes = new Set();
    html = {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (...c: string[]) => {
          for (const x of c) classes.delete(x);
        },
        contains: (c: string) => classes.has(c),
      },
      style: {},
      dataset: {},
    };
    stored = null;
    systemDark = false;
    listeners = {};
    meta = {
      content: '',
      setAttribute: (_k, v) => {
        meta.content = v;
      },
      removeAttribute: () => {},
    };
    const on = (type: string, fn: Listener) => {
      listeners[type] = [...(listeners[type] ?? []), fn];
    };
    vi.stubGlobal('document', {
      documentElement: html,
      head: { appendChild: () => {} },
      createElement: () => ({ textContent: '', remove: () => {} }),
      querySelectorAll: () => [meta],
      addEventListener: () => {},
    });
    vi.stubGlobal('localStorage', { getItem: () => stored });
    vi.stubGlobal('getComputedStyle', () => ({}));
    vi.stubGlobal('window', {
      matchMedia: () => ({
        get matches() {
          return systemDark;
        },
        addEventListener: (_t: string, fn: Listener) => on('media', fn),
      }),
      addEventListener: on,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = () => new Function(THEME_SCRIPT)();

  it('applies the OS theme when nothing is saved', () => {
    systemDark = true;
    run();
    expect([...classes]).toEqual(['dark']);
    expect(html.style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#3b4250');
  });

  it('a saved choice beats the OS, and re-applies on change', () => {
    systemDark = true;
    stored = 'light';
    run();
    expect([...classes]).toEqual(['light']);
    stored = 'dark';
    for (const fn of listeners.themechange ?? []) fn();
    expect([...classes]).toEqual(['dark']);
  });

  it('follows an OS flip only while on system', () => {
    run();
    expect([...classes]).toEqual(['light']);
    systemDark = true;
    for (const fn of listeners.media ?? []) fn();
    expect([...classes]).toEqual(['dark']);
  });
});
