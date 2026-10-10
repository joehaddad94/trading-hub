import { z } from 'zod';

/** Export file contract, schema_version 1 (tracker spec §4, news spec §1.2). */

const numeric = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]);
const serverTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
const zeroOne = z.union([z.literal(0), z.literal(1), z.boolean()]);

export const tradeSchema = z.looseObject({
  ticket: z.union([z.string().min(1), z.number().int()]).transform(String),
  symbol: z.string().min(1),
  type: z.union([z.literal(0), z.literal(1)]),
  type_str: z.string().optional(),
  lots: numeric,
  volume: z.number().nullish(),
  open_price: numeric,
  close_price: numeric,
  open_time_str: serverTime,
  close_time_str: serverTime,
  profit: numeric,
  commission: numeric.default(0),
  swap: numeric.default(0),
  // Optional: missing from past-cycle trades (get_cycle_trading_history).
  id: z.number().nullish(),
  sl: numeric.nullish(),
  tp: numeric.nullish(),
  rr_ratio: z.string().nullish(),
  reason: z.number().int().nullish(),
  is_news: zeroOne.nullish(),
  pnl_percentage: z.number().nullish(),
  // Present but wrong by the server offset — never used.
  open_time: z.number().nullish(),
  close_time: z.number().nullish(),
});

export const cycleSchema = z.looseObject({
  external_id: z.number().int(),
  reason: z.string().nullish(),
  created_at: serverTime.nullish(),
  ending_at: serverTime.nullish(),
  stats: z.record(z.string(), z.unknown()).nullish(),
  trades: z.array(tradeSchema).default([]),
});

export const statusHistoryRowSchema = z.looseObject({
  at: z.iso.datetime({ offset: true }),
  from: z.string().nullish(),
  to: z.string().nullish(),
  reason: z.string().nullish(),
});

export const applicableRuleSchema = z.looseObject({
  condition: z.string(),
  label: z.string().nullish(),
  value: z.union([z.string(), z.number()]).nullish(),
  is_account_override: z.boolean().nullish(),
});

export const accountSchema = z.looseObject({
  firm: z.string().min(1),
  external_id: z.number().int(),
  login: z.number().int(),
  parent_external_id: z.number().int().nullish(),
  bucket: z.enum(['active', 'inactive', 'breached']),
  type_label: z.string().nullish(),
  plan: z
    .looseObject({
      id: z.number().int().nullish(),
      type: z.string().nullish(),
      title: z.string().nullish(),
      next_plan: z.number().int().nullish(),
      starting_balance: numeric.nullish(),
      leverage: z.number().nullish(),
    })
    .nullish(),
  platform: z.string().nullish(),
  starting_balance: numeric,
  balance: numeric,
  equity: numeric.nullish(),
  breached: zeroOne.nullish(),
  breached_by: z.string().nullish(),
  status_history: z.array(statusHistoryRowSchema).default([]),
  overview: z.record(z.string(), z.unknown()).nullish(),
  rules: z
    .looseObject({
      applicable_rules: z.array(applicableRuleSchema).nullish(),
      risk_parameters: z.unknown().nullish(),
    })
    .nullish(),
  cycles: z.array(cycleSchema).default([]),
});

export const paymentSchema = z.looseObject({
  id: z.union([z.number(), z.string()]).transform(String),
  login: z.number().int().nullish(),
  total: numeric.nullish(),
  discount: numeric.nullish(),
  grand_total: numeric,
  date: z.iso.datetime({ offset: true }),
  order_type: z.string().nullish(),
  payment_method: z.string().nullish(),
});

export const newsEventSchema = z.looseObject({
  id: z.number().int(),
  title: z.string(),
  country: z.string(),
  impact: z.enum(['High', 'Medium', 'Low', 'Holiday']),
  timestamp: z.number().int(),
  forecast: z.string().nullish(),
  previous: z.string().nullish(),
  is_restricted: zeroOne.nullish(),
  restriction: z.string().nullish(),
});

export const exportFileSchema = z.looseObject({
  schema_version: z.literal(1),
  source: z.string(),
  generated_at: z.iso.datetime({ offset: true }),
  mode: z.enum(['full', 'incremental']),
  status: z.enum(['ok', 'partial', 'error']),
  errors: z
    .array(z.looseObject({ step: z.string(), account_id: z.number().nullish(), message: z.string() }))
    .default([]),
  firm_server_time_offset: z.string().regex(/^[+-]\d{2}:\d{2}$/),
  checksums: z
    .record(
      z.string(),
      z.looseObject({
        trade_count: z.number().int(),
        sum_profit: numeric,
        balance_change: numeric,
        match: z.boolean(),
      }),
    )
    .default({}),
  accounts: z.array(accountSchema).default([]),
  cashflows: z
    .looseObject({
      payments: z.array(paymentSchema).default([]),
      // No payout has been seen yet; the row shape is unverified, so rows are kept raw only.
      payouts: z.array(z.record(z.string(), z.unknown())).default([]),
    })
    .default({ payments: [], payouts: [] }),
  news: z
    .looseObject({
      range: z.looseObject({ start: z.string(), end: z.string() }).nullish(),
      timezone: z.string().nullish(),
      events: z.array(newsEventSchema).default([]),
    })
    .nullish(),
});

export type ExportFile = z.infer<typeof exportFileSchema>;
export type ExportAccount = z.infer<typeof accountSchema>;
export type ExportTrade = z.infer<typeof tradeSchema>;
export type ExportCycle = z.infer<typeof cycleSchema>;
export type ExportPayment = z.infer<typeof paymentSchema>;
export type ExportNewsEvent = z.infer<typeof newsEventSchema>;

export type ParseResult = { ok: true; data: ExportFile } | { ok: false; error: string; unknownVersion: boolean };

/** Validates a parsed JSON value. An unknown schema_version is reported separately (tracker spec §7). */
export function parseExportFile(input: unknown): ParseResult {
  const version = (input as { schema_version?: unknown } | null)?.schema_version;
  if (version !== 1) {
    return { ok: false, error: `Unknown schema_version: ${String(version)}`, unknownVersion: true };
  }
  const result = exportFileSchema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: z.prettifyError(result.error), unknownVersion: false };
}
