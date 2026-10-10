import { z } from 'zod';

const priceString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d+)?$/.test(v), 'must be a positive price');

const lotsString = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'lots must be a positive number with up to 2 decimals');

const instant = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const ms = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(ms)) {
    ctx.addIssue({ code: 'custom', message: 'invalid time' });
    return z.NEVER;
  }
  return new Date(ms);
});

/** "Place trade" from a long/short tool (backtester spec §6.1). `pending` becomes a limit or stop order. */
export const placeOrderSchema = z.object({
  instrument: z.string().min(1).max(20),
  side: z.enum(['long', 'short']),
  kind: z.enum(['market', 'pending']),
  entry: priceString,
  sl: priceString,
  tp: priceString,
  lots: lotsString,
  /** Replay cursor (1m open time): the order exists from here on. */
  at: instant,
  drawingId: z.uuid().nullable().optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const modifyOrderSchema = z.object({ sl: priceString, tp: priceString, at: instant });
export type ModifyOrderInput = z.infer<typeof modifyOrderSchema>;

export const cursorSchema = z.object({ at: instant });

export const costsSchema = z.object({
  spreadPoints: z.string().regex(/^\d+(\.\d+)?$/),
  commissionPerLot: z.string().regex(/^\d+(\.\d+)?$/),
  slippagePoints: z.string().regex(/^\d+(\.\d+)?$/),
});

export type OrderStatus = 'pending' | 'open' | 'closed' | 'cancelled';

/** An order as the chart shows it. Prices as strings, times as epoch ms. */
export type OrderView = {
  id: string;
  instrument: string;
  side: 'long' | 'short';
  type: 'market' | 'limit' | 'stop';
  status: OrderStatus;
  lots: string;
  entry: string;
  sl: string;
  tp: string;
  placedAt: number;
  fillPrice: string | null;
  filledAt: number | null;
  closePrice: string | null;
  closedAt: number | null;
  exitReason: 'tp' | 'sl' | 'breakeven' | 'manual' | null;
  ambiguous: boolean;
  drawingId: string | null;
  tradeId: string | null;
  /** Closed trades: net P/L and R from the trade row. */
  net: string | null;
  r: string | null;
};

export type SessionView = {
  id: string;
  name: string;
  accountId: string;
  startingBalance: string;
  riskPct: string;
  cursor: number | null;
  status: 'in_progress' | 'completed';
};
