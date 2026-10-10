import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * tech-architecture.md §10. Variables used by later build steps are optional until
 * the step that needs them lands; make them required then.
 */
export const env = createEnv({
  server: {
    ALLOWED_EMAIL: z.email().transform((v) => v.toLowerCase()),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    DATABASE_URL: z.url().optional(),
    DATABASE_URL_DIRECT: z.url().optional(),
    GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1).optional(),
    DRIVE_INBOX_FOLDER_ID: z.string().min(1).optional(),
    DRIVE_PROCESSED_FOLDER_ID: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(16).optional(),
    SENTRY_DSN: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  emptyStringAsUndefined: true,
  // CI builds run without real secrets; runtime still validates on first access.
  skipValidation: process.env.SKIP_ENV_VALIDATION === '1',
});
