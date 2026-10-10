import { parseTimeframe, type Timeframe } from '@trading/backtest-engine';
import { z } from 'zod';

/** `/api/backtest/candles` query (spec §3.2: `until` is required; nothing after it is ever returned). */
export const barsQuerySchema = z
  .object({
    instrument: z.string().regex(/^[A-Z0-9]{2,12}$/),
    tf: z.string().transform((v, ctx) => {
      const tf = parseTimeframe(v);
      if (!tf) ctx.addIssue({ code: 'custom', message: 'tf must be 1, 5 or 15' });
      return tf as Timeframe;
    }),
    until: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    before: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .optional(),
    after: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .optional(),
    count: z.coerce.number().int().min(1).max(1500).optional(),
  })
  .strict();

export type BarsQuery = z.infer<typeof barsQuerySchema>;

export function parseBarsQuery(params: URLSearchParams) {
  return barsQuerySchema.safeParse(Object.fromEntries(params));
}

export const nextQuerySchema = z
  .object({
    instrument: z.string().regex(/^[A-Z0-9]{2,12}$/),
    after: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
  })
  .strict();

export function parseNextQuery(params: URLSearchParams) {
  return nextQuerySchema.safeParse(Object.fromEntries(params));
}

const IMPACTS = ['high', 'medium', 'low', 'holiday'] as const;
const MAX_WINDOW_MS = 500 * 86_400_000;

function validWindow(from: Date, to: Date) {
  return to.getTime() > from.getTime() && to.getTime() - from.getTime() <= MAX_WINDOW_MS;
}

/** `/api/backtest/events`: a window of the calendar plus the cursor that hides future actuals. */
export const eventsQuerySchema = z
  .object({
    from: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    to: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    until: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    impact: z
      .string()
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(z.enum(IMPACTS)).max(4)),
    currency: z
      .string()
      .transform((v) => v.split(',').filter(Boolean))
      .pipe(z.array(z.string().regex(/^[A-Z]{3}$/)).max(12))
      .optional(),
  })
  .strict()
  // Runs even when a field failed (zod 4), so only judge real dates.
  .refine((q) => !(q.from instanceof Date && q.to instanceof Date) || validWindow(q.from, q.to), {
    message: 'from/to must span at most 500 days',
  });

export type EventsQuery = z.infer<typeof eventsQuerySchema>;

export function parseEventsQuery(params: URLSearchParams) {
  return eventsQuerySchema.safeParse(Object.fromEntries(params));
}

/** A news marker's event as the chart receives it; `actual` is null for releases after the cursor. */
export type ChartEvent = {
  id: string;
  title: string;
  currency: string;
  impact: 'high' | 'medium' | 'low' | 'holiday';
  eventAt: string;
  forecast: string | null;
  previous: string | null;
  actual: string | null;
  isRestricted: boolean;
};
