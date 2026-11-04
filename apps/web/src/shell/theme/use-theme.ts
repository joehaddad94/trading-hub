'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { parseThemeChoice, type ResolvedTheme, THEME_EVENT, THEME_STORAGE_KEY, type ThemeChoice } from '@/lib/theme';

/** <html> is the source of truth: the inline theme script (lib/theme.ts) sets its class and data-theme-choice. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme-choice'] });
  return () => observer.disconnect();
}

const resolved = (): ResolvedTheme => (document.documentElement.classList.contains('light') ? 'light' : 'dark');
const choice = (): ThemeChoice => parseThemeChoice(document.documentElement.dataset.themeChoice);

/** The theme on screen. The server can't know it, so it renders as dark until hydration (Fog, today's look). */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore<ResolvedTheme>(subscribe, resolved, () => 'dark');
}

/** The saved choice (light, dark or system) and a setter; the inline script applies the change. */
export function useThemeChoice(): [ThemeChoice, (next: ThemeChoice) => void] {
  const current = useSyncExternalStore<ThemeChoice>(subscribe, choice, () => 'system');
  const set = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked (private mode): nothing can be saved, so the page keeps following the OS.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);
  return [current, set];
}
