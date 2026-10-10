'use server';

import { type Drawing, drawingInputSchema } from '@trading/backtest';
import { z } from 'zod';
import type { ActionResult } from '@/lib/action-result';
import { removeAllDrawings, removeDrawing, saveDrawing, saveNewDrawing } from '@/modules/backtest/server/drawings';

const code = z.string().regex(/^[A-Z0-9]{2,12}$/);

function invalid(error: z.ZodError): { ok: false; error: string } {
  return { ok: false, error: error.issues[0]?.message ?? 'Invalid drawing.' };
}

/** Backtester spec §4: drawings persist per instrument. */
export async function createDrawingAction(instrument: string, input: unknown): Promise<ActionResult<Drawing>> {
  const parsed = z.object({ instrument: code, input: drawingInputSchema }).safeParse({ instrument, input });
  if (!parsed.success) return invalid(parsed.error);
  return saveNewDrawing(parsed.data.instrument, parsed.data.input);
}

export async function updateDrawingAction(id: string, input: unknown): Promise<ActionResult<void>> {
  const parsed = z.object({ id: z.uuid(), input: drawingInputSchema }).safeParse({ id, input });
  if (!parsed.success) return invalid(parsed.error);
  return saveDrawing(parsed.data.id, parsed.data.input);
}

export async function deleteDrawingAction(id: string): Promise<ActionResult<void>> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return invalid(parsed.error);
  return removeDrawing(parsed.data);
}

export async function deleteAllDrawingsAction(instrument: string): Promise<ActionResult<number>> {
  const parsed = code.safeParse(instrument);
  if (!parsed.success) return invalid(parsed.error);
  return removeAllDrawings(parsed.data);
}
