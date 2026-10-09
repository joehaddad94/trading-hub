/** Server Actions return this shape (CLAUDE.md rule 9). */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
