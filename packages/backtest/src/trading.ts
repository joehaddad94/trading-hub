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

/**
 * "Place trade" (backtester spec §6.1). `pending` becomes a limit or stop order. `drawn` opens a position from a
 * long/short box at exactly its entry, stop and target at the replay cursor (Joe, 26 Oct 2026).
 */
export const placeOrderSchema = z.object({
  instrument: z.string().min(1).max(20),
  side: z.enum(['long', 'short']),
  kind: z.enum(['market', 'pending', 'drawn']),
  entry: priceString,
  sl: priceString,
  tp: priceString,
  lots: lotsString,
  /** Replay cursor (1m open time): the order exists from here on. */
  at: instant,
  drawingId: z.uuid().nullable().optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const modifyOrderSchema = z.object({
  sl: priceString,
  tp: priceString,
  /** Pending orders only: a new entry level (re-typed as limit or stop against the cursor bar). */
  entry: priceString.optional(),
  at: instant,
});
export type ModifyOrderInput = z.infer<typeof modifyOrderSchema>;

export const cursorSchema = z.object({ at: instant });

/** "Close at market"; `lots` below the position size closes only that part (the rest stays open). */
export const closeOrderSchema = z.object({ at: instant, lots: lotsString.optional() });
export type CloseOrderInput = z.infer<typeof closeOrderSchema>;

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
  costs: Record<string, { spreadPoints: string; commissionPerLot: string; slippagePoints: string }>;
  setupTagId: string | null;
  notes: string | null;
};

const money = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, 'must be a positive amount');

const points = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim() || '0')
  .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) <= 1000, 'must be 0 or more');

/** New / edited backtest session (spec §7). Costs are per instrument code. */
export const sessionInputSchema = z.object({
  name: z.string().trim().min(1, 'Give the session a name').max(80),
  startingBalance: money,
  riskPct: z
    .union([z.string(), z.number()])
    .transform((v) => String(v).trim())
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0 && Number(v) <= 10, 'risk must be 0.01–10%'),
  costs: z.record(
    z.string().regex(/^[A-Z0-9]{2,12}$/),
    z.object({ spreadPoints: points, commissionPerLot: points, slippagePoints: points }),
  ),
  setupTagId: z.uuid().nullable(),
  notes: z.string().trim().max(2000).nullable(),
});
export type SessionInput = z.infer<typeof sessionInputSchema>;

/** A session row for the sessions list (spec §7). */
export type SessionSummary = SessionView & {
  trades: number;
  net: string;
  openOrders: number;
  ambiguous: number;
  instruments: string[];
  createdAt: number;
  updatedAt: number;
};
