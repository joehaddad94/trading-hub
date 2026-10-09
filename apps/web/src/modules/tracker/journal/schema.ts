import Decimal from 'decimal.js';
import { z } from 'zod';

/** Emotion chips on the journal form; free text is still accepted from older entries. */
export const EMOTIONS = ['Calm', 'Confident', 'Focused', 'Anxious', 'FOMO', 'Frustrated', 'Greedy', 'Tired'] as const;

const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const decimal = (label: string) =>
  z.preprocess(
    blankToNull,
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, `${label} must be a positive number`)
      .nullable(),
  );
const text = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max, `At most ${max} characters`).nullable());

/**
 * Journal form (§8.3 screen 6), shared by the react-hook-form client and the Server Action.
 * Money and prices stay decimal strings (CLAUDE.md rule 5).
 */
export const journalSchema = z.object({
  tradeId: z.uuid(),
  setupTagId: z.preprocess(blankToNull, z.uuid().nullable()),
  followedPlan: z.enum(['yes', 'no', '']).transform((v) => (v === '' ? null : v === 'yes')),
  initialSl: decimal('Initial stop loss'),
  plannedRr: decimal('Planned RR'),
  plannedRiskUsd: decimal('Planned risk'),
  emotionBefore: text(50),
  emotionAfter: text(50),
  mistakes: z.array(z.string().trim().min(1).max(60)).max(20),
  contextTagIds: z.array(z.uuid()).max(20),
  notes: text(10_000),
  rating: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().int().min(1).max(5).nullable(),
  ),
  next: z.boolean().default(false),
});

export type JournalFormInput = z.input<typeof journalSchema>;
export type JournalFormValues = z.output<typeof journalSchema>;

/** Rejects an initial stop on the wrong side of entry (above a buy / below a sell). */
export function stopSideError(side: 'buy' | 'sell', openPrice: string, initialSl: string | null): string | null {
  if (initialSl === null) return null;
  const sl = new Decimal(initialSl);
  if (side === 'buy' && sl.gte(openPrice)) return `A buy's stop loss must be below the entry (${openPrice}).`;
  if (side === 'sell' && sl.lte(openPrice)) return `A sell's stop loss must be above the entry (${openPrice}).`;
  return null;
}

export const tagSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  kind: z.enum(['setup', 'mistake', 'context']),
});
