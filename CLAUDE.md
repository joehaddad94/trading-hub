# CLAUDE.md — Trading App

Personal trading web app for Joe (single user). Three separate modules behind a hub: **Tracker** (incl. Journal), **News**, **Backtest Lab**.

## Read first
- `docs/MILESTONES.md` — build order; one milestone at a time, each ends with the test gate and a commit
- `docs/specs/tech-architecture.md` — stack, folders, conventions (wins on technical questions)
- `docs/specs/trading-tracker-spec.md` — data pipeline, schema, metrics, screens, app shell (§8.0)
- `docs/specs/news-spec.md`, `docs/specs/backtester-spec.md`

## Stack (do not swap without asking Joe)
Next.js App Router (no NestJS) · pnpm + Turborepo · Supabase (Postgres, Auth, Storage) · Drizzle · zod · nuqs · Tailwind + shadcn/ui · Recharts · KLineCharts · react-hook-form · date-fns + @date-fns/tz · decimal.js · Sentry · Vitest · Playwright · Biome · dependency-cruiser · Vercel (Hobby: daily crons only).

## Commands
- `pnpm dev` — run the app (needs `supabase start` first)
- `pnpm lint` / `pnpm format` — Biome
- `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm boundaries`
- `pnpm db:generate` (drizzle-kit → supabase/migrations) · `supabase db reset` (local)

## Hard rules
1. The app **never** calls FundedNext, cTrader, ForexFactory or any trading platform. Trade/news data arrives only as JSON files in the Google Drive inbox (contract: tracker spec §4).
2. **Never delete live data.** Accounts and `source = 'live'` trades are permanent. Only backtest trades/sessions can be deleted.
3. Modules don't import each other. Shared code → `src/shell`, `src/lib`, or `packages/*`. `dependency-cruiser` must pass.
4. Pure logic (metrics, indicators, backtest engine, contract parsing) lives in packages with unit tests. No business logic in components or route files.
5. Money: `numeric` in DB, `decimal.js` in code. Never `parseFloat` money.
6. Time: store UTC; display Asia/Beirut; trading sessions in America/New_York.
7. Backtester: **no lookahead** — never return or render data after the replay cursor.
8. Every metric comes from `packages/core/metrics` — one definition, used everywhere.
9. zod at every boundary; Server Actions return `{ ok, data } | { ok: false, error }`.
10. Server-only files start with `import 'server-only'`; service-role key never reaches the client.
11. Every screen works on phone and desktop.
12. Cron routes check `CRON_SECRET`, are idempotent, and report failures to Sentry.
13. FundedNext trade time strings are **server time UTC+03:00** (use the file's `firm_server_time_offset`); their unix fields are wrong. News timestamps are true UTC. See tracker spec §4 "Verified in the Phase 0 test export".
14. The importer recomputes each file's checksums and rejects accounts whose trades don't add up to the balance change.
15. Real data fixture for tests: `docs/specs/fixtures/fundednext_2026-10-09_2100Z.json` (3 accounts, 99 trades). Copy it into `packages/contract/fixtures/` when that package exists.

## Workflow
- Work on a branch per phase step; open a PR; CI must be green.
- Conventional Commits (`feat(tracker): …`).
- New runtime dependency → justify it in the PR description.
- Unsure about product behaviour → ask Joe; don't guess. Unsure about an API → check the library's current docs.
- Don't touch applied migrations; add new ones.
- Keep PRs small; update the spec's phase checklist when a step is done.
