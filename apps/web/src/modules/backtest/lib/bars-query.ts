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
