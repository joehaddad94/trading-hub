import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integration files share one database and lock the same rows (sync_health, raw_imports).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Server code is covered by the DB integration tests (they need TEST_DATABASE_URL).
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/server/**'],
      thresholds: { lines: 80 },
    },
  },
});
