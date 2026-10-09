import { defineConfig, devices } from '@playwright/test';

const port = 3100;

/** Local only: a stand-in for Supabase Auth so signed-in pages can be tested without Docker (see e2e/support). */
const fakeAuth = process.env.E2E_FAKE_AUTH === '1' && !process.env.GITHUB_ACTIONS;

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    ...(fakeAuth
      ? [{ command: 'node e2e/support/fake-auth.mjs', url: 'http://127.0.0.1:54321/health', reuseExistingServer: true }]
      : []),
    {
      command: `pnpm next start --port ${port}`,
      port,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'e2e-anon-key',
        ALLOWED_EMAIL: process.env.ALLOWED_EMAIL ?? 'owner@example.com',
        ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
        CRON_SECRET: process.env.CRON_SECRET ?? 'e2e-cron-secret-not-real',
      },
    },
  ],
});
