import { IMPACT_COLOURS } from '@trading/core';
import type { ChartEvent } from '../lib/bars-query';
import { formatCursor } from './replay-time';

/** Hover card for the news markers in the bar under the crosshair: title, forecast, previous (and actual once released). */
export function NewsPanel({ events, timezone }: { events: ChartEvent[]; timezone: string }) {
  if (events.length === 0) return null;
  return (
    <div
      role="status"
      aria-label="News at this bar"
      className="pointer-events-none absolute top-8 right-16 z-10 flex max-w-xs flex-col gap-2 rounded-md border bg-popover/95 p-2 text-xs shadow-md"
    >
      {events.map((e) => (
        <div key={e.id} className="flex flex-col gap-0.5">
          <p className="flex items-center gap-1 font-medium">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: IMPACT_COLOURS[e.impact] }} />
            {e.currency} · {e.title}
            {e.isRestricted && <span title="Restricted"> 🔒</span>}
          </p>
          <p className="text-muted-foreground">
            {formatCursor(Date.parse(e.eventAt), timezone)} · forecast {e.forecast ?? '—'} · previous{' '}
            {e.previous ?? '—'}
            {e.actual !== null && ` · actual ${e.actual}`}
          </p>
        </div>
      ))}
    </div>
  );
}
