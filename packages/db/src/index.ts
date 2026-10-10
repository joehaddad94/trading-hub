import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index';

export type Database = ReturnType<typeof createDb>;

/**
 * Server-only. Use the Supabase transaction pooler URL in serverless code:
 * the pooler does not support prepared statements, hence `prepare: false`.
 */
export function createDb(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle({ client, schema, casing: 'snake_case' });
}

/** A transaction handle, as passed to `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Anything queries can run on: the pool or an open transaction. */
export type Executor = Database | Tx;
