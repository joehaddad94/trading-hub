import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error('DATABASE_URL_DIRECT is required for drizzle-kit (direct, non-pooled connection).');

export default defineConfig({
  dialect: 'postgresql',
  schema: './packages/db/src/schema/index.ts',
  out: './supabase/migrations',
  casing: 'snake_case',
  dbCredentials: { url },
  migrations: { prefix: 'timestamp' },
});
