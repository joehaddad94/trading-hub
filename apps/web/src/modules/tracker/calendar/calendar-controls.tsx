'use client';

import { useQueryStates } from 'nuqs';
import { useId } from 'react';
import { CELL_MODE_LABELS, CELL_MODES, calendarSearchParams } from './search-params';

/** Cell display toggle and month picker (§8.2). Both live in the URL. */
export function CalendarControls({ month }: { month: string }) {
  const id = useId();
  const [{ cell }, set] = useQueryStates(calendarSearchParams);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <fieldset className="flex rounded-md border p-0.5" aria-label="Cell shows">
        {CELL_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={cell === mode}
            onClick={() => void set({ cell: mode === 'net' ? null : mode })}
            className="h-9 rounded px-2 text-xs aria-pressed:bg-accent aria-pressed:font-medium md:h-8"
          >
            {CELL_MODE_LABELS[mode]}
          </button>
        ))}
      </fieldset>
      <label htmlFor={id} className="sr-only">
        Pick a month
      </label>
      <input
        id={id}
        type="month"
        value={month}
        onChange={(e) => e.target.value && void set({ month: e.target.value, day: null })}
        className="h-9 rounded-md border bg-background px-2 text-sm md:h-8"
      />
    </div>
  );
}
