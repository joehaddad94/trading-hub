import { defineConfig } from 'drizzle-kit';

// `generate` needs no connection; `migrate`/`push`/`studio` use the direct (non-pooled) URL.
const url = process.env.DATABASE_URL_DIRECT;

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema/index.ts',
  out: './supabase/migrations',
  casing: 'snake_case',
  migrations: { prefix: 'supabase' },
  ...(url ? { dbCredentials: { url } } : {}),
});
