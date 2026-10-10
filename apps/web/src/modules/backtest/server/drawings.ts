import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { Drawing, DrawingInput } from '@trading/backtest';
import {
  createDrawing,
  DrawingError,
  deleteAllDrawings,
  deleteDrawing,
  listDrawings,
  updateDrawing,
} from '@trading/backtest/server';
import type { ActionResult } from '@/lib/action-result';
import { getDb } from '@/lib/server/db';

async function run<T>(fn: (db: NonNullable<ReturnType<typeof getDb>>) => Promise<T>): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  try {
    return { ok: true, data: await fn(db) };
  } catch (error) {
    if (error instanceof DrawingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Could not save the drawing.' };
  }
}

export async function getDrawings(): Promise<Drawing[]> {
  const db = getDb();
  return db ? listDrawings(db) : [];
}

export const saveNewDrawing = (code: string, input: DrawingInput) => run((db) => createDrawing(db, code, input));
export const saveDrawing = (id: string, input: DrawingInput) => run((db) => updateDrawing(db, id, input));
export const removeDrawing = (id: string) => run((db) => deleteDrawing(db, id));
export const removeAllDrawings = (code: string) => run((db) => deleteAllDrawings(db, code));
