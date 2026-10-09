import 'server-only';
import { createDb, type Database } from '@trading/db';
import { env } from '@/lib/env';

let db: Database | undefined;

/** Server-side Postgres (Supabase transaction pooler). Null until DATABASE_URL is configured. */
export function getDb(): Database | null {
  if (!env.DATABASE_URL) return null;
  db ??= createDb(env.DATABASE_URL);
  return db;
}
