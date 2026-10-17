'use client';

import { INDICATORS } from '@trading/indicators';
import { ChartSpline, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { INDICATOR_COLOURS, type IndicatorPrefs } from './indicators';

/** Indicator toggles plus a settings panel per indicator (length, colour; RSI levels). Spec §5. */
export function IndicatorMenu({
  prefs,
  onChange,
}: {
  prefs: IndicatorPrefs;
  onChange: (id: string, next: Partial<IndicatorPrefs[string]>) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const def = INDICATORS.find((d) => d.id === editing);
  const current = editing ? prefs[editing] : undefined;
  return (
    <fieldset className="relative flex items-center gap-1">
      <legend className="sr-only">Indicators</legend>
      <span className="flex items-center gap-1 px-1 text-muted-foreground" title="Indicators">
        <ChartSpline className="size-4" aria-hidden />
        <span className="hidden lg:inline">Indicators</span>
      </span>
      {INDICATORS.map((d) => {
        const p = prefs[d.id];
        return (
          <span key={d.id} className="flex items-center">
            <button
              type="button"
              aria-pressed={p?.on ?? false}
              onClick={() => onChange(d.id, { on: !p?.on })}
              className={cn(
                'h-9 rounded-l-md px-2',
                p?.on ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {d.label}
            </button>
            <button
              type="button"
              aria-label={`${d.label} settings`}
              aria-expanded={editing === d.id}
              onClick={() => setEditing(editing === d.id ? null : d.id)}
              className="h-9 rounded-r-md px-1 text-muted-foreground hover:bg-accent/60"
            >
              <Settings2 className="size-4" aria-hidden />
            </button>
          </span>
        );
      })}
      {def && current && (
        <div
          role="dialog"
          aria-label={`${def.label} settings`}
          className="absolute top-full left-0 z-20 mt-1 flex w-60 flex-col gap-2 rounded-md border bg-popover p-3 text-sm shadow-md"
        >
          {def.fields.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-2">
              {f.label}
              <input
                type="number"
                inputMode="numeric"
                min={f.min}
                max={f.max}
                step={f.step}
                key={`${f.key}-${current.settings[f.key]}`}
                defaultValue={current.settings[f.key]}
                onBlur={(e) => onChange(def.id, { settings: { ...current.settings, [f.key]: Number(e.target.value) } })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="h-9 w-20 rounded-md border bg-background px-2 text-right num"
              />
            </label>
          ))}
          <div className="flex items-center justify-between gap-2">
            Colour
            <span className="flex gap-1">
              {INDICATOR_COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  aria-pressed={current.color === c}
                  onClick={() => onChange(def.id, { color: c })}
                  className="size-6 rounded-full border-2 border-transparent aria-pressed:border-foreground"
                  style={{ backgroundColor: c }}
                />
              ))}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="h-9 self-end rounded-md px-3 text-muted-foreground hover:bg-accent/60"
          >
            Done
          </button>
        </div>
      )}
    </fieldset>
  );
}
