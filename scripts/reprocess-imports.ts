/**
 * Rebuilds derived tables by re-applying every stored export file in generated_at order
 * (tracker spec §5: raw_imports keeps every file verbatim). Safe to re-run: imports are idempotent.
 *
 *   DATABASE_URL_DIRECT=postgres://… pnpm tsx scripts/reprocess-imports.ts
 */
import { createDb } from '@trading/db';
import { asc, sql } from '@trading/db/orm';
import { rawImports } from '@trading/db/schema';
import { processExportFile } from '@trading/importer/server';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT is required');

const db = createDb(url);
const rows = await db
  .select({ driveFileId: rawImports.driveFileId, fileName: rawImports.fileName, payload: rawImports.payload })
  .from(rawImports)
  .where(sql`${rawImports.payload} ? 'schema_version'`)
  .orderBy(asc(rawImports.generatedAt), asc(rawImports.createdAt));

for (const row of rows) {
  const outcome = await processExportFile(
    db,
    { driveFileId: row.driveFileId, fileName: row.fileName, content: JSON.stringify(row.payload) },
    new Date(),
  );
  console.warn(`${row.fileName}: ${outcome.result}${outcome.error ? ` — ${outcome.error.split('\n')[0]}` : ''}`);
}
await db.$client.end();
