'use client';

import { type LucideIcon, Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import type { ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useResolvedTheme, useThemeChoice } from './use-theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Light / Dark / System as one segmented control of real radios (Settings, phone "More" menu). */
export function ThemeSwitch({ className }: { className?: string }) {
  const [choice, setChoice] = useThemeChoice();
  // Settings and the phone "More" menu can both be on the page; each needs its own radio group.
  const name = useId();
  return (
    <fieldset className={cn('m-0 grid min-w-0 grid-cols-3 gap-1 rounded-lg border-0 bg-muted p-1', className)}>
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <label
          key={value}
          className="flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:text-foreground has-checked:bg-popover has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name={name}
            value={value}
            checked={choice === value}
            onChange={() => setChoice(value)}
            className="sr-only"
          />
          <Icon className="size-4" aria-hidden strokeWidth={1.8} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

/** One tap flips to the other theme (desktop rail, phone guest bar). Settings still offers "System". */
export function ThemeButton({ className, label = false }: { className: string; label?: boolean }) {
  const theme = useResolvedTheme();
  const [, setChoice] = useThemeChoice();
  const next = theme === 'dark' ? 'light' : 'dark';
  const name = next === 'light' ? 'Light mode' : 'Dark mode';
  const Icon = next === 'light' ? Sun : Moon;
  return (
    <button type="button" onClick={() => setChoice(next)} className={cn('group relative', className)}>
      <Icon className="size-5" aria-hidden strokeWidth={1.8} />
      {label ? name : <span className="sr-only">{name}</span>}
      {!label && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-foreground text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {name}
        </span>
      )}
    </button>
  );
}
