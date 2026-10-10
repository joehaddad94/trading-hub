import { z } from 'zod';

/** Backtester spec §4 tools. Each has a chart module in the web tool registry. */
export const DRAWING_TOOLS = ['horizontal', 'trend', 'long', 'short', 'measure'] as const;
export type DrawingTool = (typeof DRAWING_TOOLS)[number];

/** How many points each tool stores (positions: entry, stop, target). */
export const TOOL_POINTS: Record<DrawingTool, number> = { horizontal: 1, trend: 2, long: 3, short: 3, measure: 2 };

const point = z.object({ ts: z.number().int().nonnegative(), price: z.number().finite().positive() });

const decimalString = z.string().regex(/^\d{1,9}(\.\d{1,4})?$/);

export const drawingStyleSchema = z
  .object({
    color: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .default('#60a5fa'),
    width: z.number().int().min(1).max(4).default(1),
    lock: z.boolean().default(false),
    extend: z.enum(['none', 'left', 'right', 'both']).optional(),
    sizing: z.object({ mode: z.enum(['lots', 'risk_usd', 'risk_pct']), value: decimalString }).optional(),
  })
  .strict();

export type DrawingStyle = z.infer<typeof drawingStyleSchema>;

export const drawingInputSchema = z
  .object({
    tool: z.enum(DRAWING_TOOLS),
    points: z.array(point).min(1).max(3),
    style: drawingStyleSchema,
    label: z.string().trim().max(80).nullable().default(null),
  })
  .refine((d) => d.points.length === TOOL_POINTS[d.tool], { message: 'Wrong number of points for this tool' });

export type DrawingInput = z.infer<typeof drawingInputSchema>;
export type DrawingPoint = z.infer<typeof point>;

export type Drawing = DrawingInput & { id: string; instrument: string; sessionId: string | null };
