import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { Drawing, DrawingInput } from '@trading/backtest';
import {
  createDrawing,
  DrawingError,
  deleteAllDrawings,
  deleteDrawing,
  listDrawings,
  type Owner,
  updateDrawing,
} from '@trading/backtest/server';
import type { ActionResult } from '@/lib/action-result';
import { getDb } from '@/lib/server/db';
import { backtestOwner } from '@/lib/server/viewer';

async function run<T>(
  fn: (db: NonNullable<ReturnType<typeof getDb>>, owner: Owner) => Promise<T>,
): Promise<ActionResult<T>> {
  const db = getDb();
  if (!db) return { ok: false, error: 'DATABASE_URL is not configured.' };
  const owner = await backtestOwner();
  if (owner === undefined) return { ok: false, error: 'Sign in again.' };
  try {
    return { ok: true, data: await fn(db, owner) };
  } catch (error) {
    if (error instanceof DrawingError) return { ok: false, error: error.message };
    Sentry.captureException(error);
    return { ok: false, error: 'Could not save the drawing.' };
  }
}

/** The viewer's own drawings. */
export async function getDrawings(): Promise<Drawing[]> {
  const db = getDb();
  const owner = await backtestOwner();
  return db && owner !== undefined ? listDrawings(db, owner) : [];
}

export const saveNewDrawing = (code: string, input: DrawingInput) =>
  run((db, owner) => createDrawing(db, owner, code, input));
export const saveDrawing = (id: string, input: DrawingInput) => run((db, owner) => updateDrawing(db, owner, id, input));
export const removeDrawing = (id: string) => run((db, owner) => deleteDrawing(db, owner, id));
export const removeAllDrawings = (code: string) => run((db, owner) => deleteAllDrawings(db, owner, code));
