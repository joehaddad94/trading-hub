import type { Executor } from '@trading/db';
import { and, asc, eq, isNull } from '@trading/db/orm';
import { drawings, instruments } from '@trading/db/schema';
import type { Drawing, DrawingInput } from '../drawings';

export class DrawingError extends Error {}

const columns = {
  id: drawings.id,
  instrument: instruments.code,
  sessionId: drawings.sessionId,
  tool: drawings.tool,
  points: drawings.points,
  style: drawings.style,
  label: drawings.label,
};

type Row = {
  id: string;
  instrument: string;
  sessionId: string | null;
  tool: Drawing['tool'];
  points: unknown;
  style: unknown;
  label: string | null;
};
const toDrawing = (r: Row) => r as Drawing;

/** Drawings of every instrument for the chart (no session = the free chart). Small: loaded in one go. */
export async function listDrawings(db: Executor, sessionId: string | null = null): Promise<Drawing[]> {
  const rows = await db
    .select(columns)
    .from(drawings)
    .innerJoin(instruments, eq(instruments.id, drawings.instrumentId))
    .where(sessionId ? eq(drawings.sessionId, sessionId) : isNull(drawings.sessionId))
    .orderBy(asc(drawings.createdAt));
  return rows.map(toDrawing);
}

async function instrumentId(db: Executor, code: string) {
  const [row] = await db.select({ id: instruments.id }).from(instruments).where(eq(instruments.code, code));
  if (!row) throw new DrawingError(`Unknown instrument ${code}.`);
  return row.id;
}

export async function createDrawing(
  db: Executor,
  code: string,
  input: DrawingInput,
  sessionId: string | null = null,
): Promise<Drawing> {
  const [row] = await db
    .insert(drawings)
    .values({ instrumentId: await instrumentId(db, code), sessionId, ...input })
    .returning({ id: drawings.id });
  if (!row) throw new DrawingError('Could not save the drawing.');
  return { id: row.id, instrument: code, sessionId, ...input };
}

/** Moves/restyles a drawing; its tool and instrument never change. */
export async function updateDrawing(db: Executor, id: string, input: DrawingInput): Promise<void> {
  const updated = await db
    .update(drawings)
    .set({ points: input.points, style: input.style, label: input.label })
    .where(and(eq(drawings.id, id), eq(drawings.tool, input.tool)))
    .returning({ id: drawings.id });
  if (updated.length === 0) throw new DrawingError('Drawing not found.');
}

export async function deleteDrawing(db: Executor, id: string): Promise<void> {
  await db.delete(drawings).where(eq(drawings.id, id));
}

/** "Delete all" for one instrument's chart (same session scope). */
export async function deleteAllDrawings(db: Executor, code: string, sessionId: string | null = null): Promise<number> {
  const id = await instrumentId(db, code);
  const removed = await db
    .delete(drawings)
    .where(
      and(eq(drawings.instrumentId, id), sessionId ? eq(drawings.sessionId, sessionId) : isNull(drawings.sessionId)),
    )
    .returning({ id: drawings.id });
  return removed.length;
}
