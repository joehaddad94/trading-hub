# Technical Architecture — Trading App

> **Audience:** Claude Code. Read with `trading-tracker-spec.md`, `backtester-spec.md`, `news-spec.md`.
> This file decides **how** to build; the specs decide **what** to build. If they conflict on a technical point, this file wins. If they conflict on a product point, the specs win — ask Joe.

---

## 1. Decisions (do not change without asking Joe)

| Area | Decision | Why |
|---|---|---|
| App framework | **Next.js (App Router) only** — no NestJS | Single user, few background jobs; one deploy on Vercel. Business logic lives in framework-free packages so it could move to NestJS later. |
| Repo | **pnpm workspaces + Turborepo monorepo** | Enforces module boundaries; pure logic (metrics, indicators, fill engine) testable in isolation. |
| Database | **Supabase Postgres** (+ Auth + Storage) | Chosen by Joe. |
| ORM | **Drizzle** (`drizzle-orm` + `postgres` driver), migrations via `drizzle-kit` into `supabase/migrations/` | SQL-first, typed, light on serverless; time-bucket queries stay plain SQL. |
| Data access | **Server Components for reads, Server Actions for writes**; TanStack Query only where the client must refetch live (backtest replay, heavy filter views) | Least client JS; no separate API layer to maintain. |
| URL state | **nuqs** for scope selector and filters | Spec requires scope/filters in the URL. |
| UI | **Tailwind + shadcn/ui** (Radix), **lucide-react** icons, **sonner** toasts (undo on delete) | Own the component code; accessible; dark theme. |
| Charts | **Recharts via shadcn charts** for stats/equity curves; **KLineCharts** for the backtester chart | Recharts for dashboards; KLineCharts has drawing overlays built in. |
| Forms | **react-hook-form + zod** | Journal and settings forms; same zod schemas server-side. |
| Validation | **zod at every boundary** (export file, actions, env, API routes) | |
| Env | **@t3-oss/env-nextjs** | App fails fast on missing/invalid env. |
| Money math | **decimal.js** in code, `numeric(14,2)` in DB | Never sum money as JS floats. |
| Dates | **date-fns v4 + @date-fns/tz** | Store UTC, display Asia/Beirut, sessions in America/New_York. |
| Scheduling | **Vercel Cron on the free Hobby plan: daily jobs only** + **import-on-open** (§6) | Hobby allows once/day per job, ±59 min. Data is daily anyway. |
| Errors | **Sentry (free tier)** via `@sentry/nextjs` | Banner says *that* it broke; Sentry says *why*. |
| Tests | **Vitest** (logic-heavy) + **Playwright** smoke tests | Bugs here are wrong numbers, not broken buttons. |
| Lint/format | **Biome** + **dependency-cruiser** for module boundaries | Biome for speed; dependency-cruiser enforces the import rules in §3. |
| Git/CI | **Branch + PR, GitHub Actions, Vercel preview per PR**, merge to `main` deploys | |
| Environments | **Local Supabase (CLI/Docker) + one Supabase cloud project** | Dev/tests local; migrations pushed to cloud from CI. |
| AI guidance | **`CLAUDE.md` at repo root** (provided alongside this file) | |

---

## 2. Folder structure

```
trading-app/
├── CLAUDE.md                     # rules for Claude Code (see CLAUDE.md file)
├── docs/
│   └── specs/                    # trading-tracker-spec.md, backtester-spec.md, news-spec.md, tech-architecture.md
├── apps/
│   └── web/                      # the Next.js app
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/login/
│       │   │   ├── (hub)/page.tsx                 # "/" module hub
│       │   │   ├── (tracker)/tracker/             # layout.tsx = Tracker nav
│       │   │   │   ├── page.tsx                   # Overview
│       │   │   │   ├── calendar/  trades/  trades/[id]/  journal/
│       │   │   │   ├── accounts/  accounts/[login]/  analytics/  money/
│       │   │   ├── (news)/news/                   # layout.tsx = News nav
│       │   │   │   ├── page.tsx  history/  rules/
│       │   │   ├── (backtest)/backtest/           # layout.tsx = full-screen lab layout
│       │   │   │   ├── page.tsx  [session]/  [session]/replay/
│       │   │   ├── settings/  settings/imports/
│       │   │   └── api/
│       │   │       ├── cron/import/route.ts       # daily
│       │   │       ├── cron/candles/route.ts      # daily
│       │   │       └── backtest/candles/route.ts  # replay candles, requires `until`
│       │   ├── modules/
│       │   │   ├── tracker/  { components/, server/ (queries.ts, actions.ts), lib/ }
│       │   │   ├── news/     { components/, server/, lib/ }
│       │   │   └── backtest/ { components/, server/, lib/, chart/ (KLineCharts adapters, tool + indicator registries) }
│       │   ├── shell/        # hub cards, module headers, module switcher, sync banner, scope selector
│       │   ├── components/ui/# shadcn components (generated)
│       │   ├── lib/          # supabase server/browser clients, auth guard, env.ts, sentry, decimal helpers
│       │   └── instrumentation.ts
│       ├── e2e/              # Playwright smoke tests
│       ├── vercel.json       # crons
│       └── next.config.ts
├── packages/
│   ├── db/                   # Drizzle schema (one file per domain), client factory, RLS helpers, seed
│   ├── contract/             # zod schema for the FundedNext export file (tracker spec §4) + fixtures
│   ├── core/                 # pure domain logic: metrics, risk resolution, scope resolution, sessions, time utils, status mapping
│   ├── importer/             # parse contract → upsert plan (pure) ; Drive reader (server-only)
│   ├── indicators/           # ATR, RSI (pure, tested vs reference values)
│   ├── backtest-engine/      # replay cursor, 1m→5m/15m aggregation, fill + exit rules, cost model (pure)
│   ├── market-data/          # MarketDataProvider interface + Dukascopy implementation
│   └── config/               # shared tsconfig, biome.json, dependency-cruiser config
├── supabase/
│   ├── config.toml
│   ├── migrations/           # generated by drizzle-kit + hand-written RLS/policy SQL
│   └── seed.sql
├── scripts/
│   ├── backfill-candles.ts
│   └── reprocess-imports.ts
├── .github/workflows/ci.yml
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

---

## 3. Boundary rules (enforced by dependency-cruiser in CI)

1. `apps/web/src/modules/<a>` **must not import** from `modules/<b>`. Shared needs go to `shell/`, `lib/`, or a package.
2. `packages/*` **must not import** from `apps/*`, Next.js, or React — except a future `packages/ui` if created.
3. `packages/core`, `indicators`, `backtest-engine`, `contract` are **pure**: no DB, no network, no `Date.now()` without injection. These hold most unit tests.
4. DB access only in `packages/db`, `packages/importer` (server part), and `modules/*/server/`. Every server file starts with `import 'server-only'`.
5. Client components never receive the service-role key or raw DB clients.
6. Cross-module navigation = links only (e.g. Tracker → `/news?date=…`), never imports.

---

## 4. Dependencies (install latest stable at setup; verify APIs before use)

**apps/web**
- `next`, `react`, `react-dom`, `typescript`
- `@supabase/supabase-js`, `@supabase/ssr`
- `drizzle-orm`, `postgres`
- `zod`, `@t3-oss/env-nextjs`, `nuqs`
- `react-hook-form`, `@hookform/resolvers`
- `@tanstack/react-query` (replay + heavy filters only)
- `tailwindcss`, shadcn/ui (via CLI), `lucide-react`, `sonner`, `recharts`
- `klinecharts`
- `date-fns`, `@date-fns/tz`, `decimal.js`
- `@googleapis/drive` (Drive inbox reader; server-only)
- `@sentry/nextjs`

**packages** — only what each needs (`zod`, `decimal.js`, `date-fns`, `drizzle-orm`, `dukascopy-node` in `market-data`).

**dev (root)** — `turbo`, `@biomejs/biome`, `dependency-cruiser`, `vitest`, `@vitest/coverage-v8`, `@playwright/test`, `drizzle-kit`, `supabase` (CLI), `tsx`.

Rules: no new runtime dependency without a one-line reason in the PR description; prefer the platform (fetch, Intl) over libraries; no lodash/moment/axios.

---

## 5. Database conventions

- Drizzle schema in `packages/db/src/schema/*.ts`, snake_case in DB, camelCase in TS (Drizzle `casing: 'snake_case'`).
- `drizzle-kit generate` writes SQL into `supabase/migrations/`; RLS policies and functions are hand-written SQL migrations next to them. Never edit an applied migration; add a new one.
- **RLS on every table**: allow only the authenticated user whose email = `ALLOWED_EMAIL`. Cron/import use a server-only connection with the service role.
- Serverless connection: Supabase **transaction pooler** URL with `prepare: false` on the `postgres` client. Direct connection only for migrations/scripts.
- `numeric` columns come back as strings → convert with `decimal.js`; never `parseFloat` for money.
- All timestamps `timestamptz` (UTC). Day buckets computed in SQL with the configured timezone (tracker spec §8.2).
- Idempotent upserts with `ON CONFLICT` on the natural keys defined in the specs.
- Indexes at minimum: `trades(account_id, closed_at)`, `trades(source, closed_at)`, `candles_1m(instrument_id, ts)` (PK), `economic_events(event_at)`, `raw_imports(drive_file_id)`.

---

## 6. Scheduling on Vercel Hobby (replaces "hourly" in the tracker spec)

Hobby cron: **once per day per job, fires anywhere within the scheduled hour**. Cron times are **UTC**; Beirut shifts between UTC+3 and UTC+2 with DST, so schedules keep a buffer.

| Job | Schedule (`vercel.json`, UTC) | Does |
|---|---|---|
| `/api/cron/import` | `0 23 * * *` (≈ 01:00–02:59 Beirut) | Read Drive inbox → validate → upsert → move file to `processed/` → update `sync_health` → run staleness checks |
| `/api/cron/candles` | `0 4 * * *` | Fetch previous UTC day of 1m candles for US30/NAS100 → upsert → gap check |

**Import-on-open:** the hub and module layouts call `maybeImport()` via Next's `after()` (runs after the response, doesn't slow the page). It imports new inbox files if the last check was > 10 min ago (throttle stored in `sync_health`). Also exposed as a "Sync now" button in Settings › Imports.

**Staleness checks** (tracker spec §7 conditions) run inside the import job **and** on every page load (cheap read of `sync_health` + latest `raw_imports`) to drive the in-app banner. No separate staleness cron.

All cron routes require `Authorization: Bearer ${CRON_SECRET}`, are idempotent, log to Sentry on failure, and finish well under the Hobby function time limit (split work if needed).

---

## 7. Code conventions

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Server Actions: validate input with zod; return `{ ok: true, data } | { ok: false, error }`; never throw to the client; `revalidatePath`/`revalidateTag` after writes.
- Files kebab-case; components PascalCase; one component per file; colocate component tests only for pure helpers.
- No business logic in components or route files — call `packages/core` / module `server/` functions.
- Every number shown to Joe comes from one function in `packages/core/metrics` (single source of truth for R, win rate, PF, expectancy, drawdown).
- Errors: `Sentry.captureException` in cron/import/actions; user-facing messages are plain and specific.
- Accessibility: real buttons/links/labels, focus states, 44px touch targets, color never the only signal (P/L also has +/− sign).
- Responsive: every screen designed for phone and desktop (tracker spec §8.0).

---

## 8. Testing

| Layer | Tool | What |
|---|---|---|
| Pure logic | Vitest | `contract` parsing (`rr_ratio`, `lots`, timestamps, side), `core/metrics`, risk resolution order, status mapping, day bucketing across DST, `indicators` vs reference values, `backtest-engine` (fills, SL-first ambiguity, gaps, costs, **no lookahead**), news dedupe |
| DB integration | Vitest + local Supabase | Import a fixture file twice → identical row counts (idempotency); RLS denies a non-allowed user; deleting a live trade is refused |
| E2E smoke | Playwright | Login → hub; import fixture → calendar shows days; scope switch; journal a trade on mobile viewport; delete a backtest trade + undo |

Fixtures in `packages/contract/fixtures/` built from the real samples in the tracker spec. CI fails under 80% line coverage for `core`, `indicators`, `backtest-engine`, `contract` (no target for UI).

---

## 9. CI/CD

`.github/workflows/ci.yml` on every PR:
1. `pnpm install --frozen-lockfile`
2. `turbo run lint typecheck test` (Biome, `tsc --noEmit`, Vitest)
3. `dependency-cruiser` boundary check
4. Start local Supabase (`supabase start`), apply migrations, run DB integration tests + Playwright smoke tests
5. Vercel builds a preview deployment per PR (Git integration)

On merge to `main`: `supabase db push` to the cloud project (secret `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`), then Vercel production deploy. Migrations run **before** the app deploy.

Commits: Conventional Commits (`feat(tracker): …`, `fix(importer): …`). One PR per phase step, small and reviewable.

---

## 10. Environment variables

Validated in `apps/web/src/lib/env.ts`. Server-only unless prefixed `NEXT_PUBLIC_`.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (pooler), `DATABASE_URL_DIRECT` (migrations/scripts), `ALLOWED_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_INBOX_FOLDER_ID`, `DRIVE_PROCESSED_FOLDER_ID`, `CRON_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` (build). Reserved for later: `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

`.env.example` committed; real values only in Vercel / GitHub secrets / local `.env.local`.

---

## 11. Security checklist

- Auth: Supabase Auth magic link for the owner (`ALLOWED_EMAIL`); the proxy protects every route except `/login` and cron routes (which use `CRON_SECRET`).
- Invited Backtest Lab users (26 Oct 2026, MILESTONES U1): emails in `backtest_users` (owner manages them in Settings › Users, max 10) sign in with the email alone; the server mints and redeems a magic-link token with the service role, so no email is sent. The proxy lets them reach `/backtest/**` and `/api/backtest/**` only and re-checks the list on every request. Their rows carry `owner_id` (auth user id; null = the owner) on `backtest_sessions` and `drawings`, and every backtest query is scoped by it, because the app's DB connection bypasses RLS. Tracker, News and Settings Server Actions start with `ownerOnly()` (a unit test enforces it). Invited users have no Supabase API access (RLS stays owner-only).
- RLS on all tables; service role only in server code.
- Drive service account has access to the two app folders only.
- Storage bucket private; screenshots via short-lived signed URLs.
- No secrets in client bundles (env validation + `server-only`).
- Live trades cannot be deleted (DB check + server guard); only `source = 'backtest'` deletes.

---

## 12. Build order (maps to spec phases)

1. **Scaffold:** monorepo, Next.js app, Biome, dependency-cruiser, Vitest, Playwright, CI, Sentry, env validation, local Supabase, auth + allowed email, app shell (hub + three module layouts, empty pages).
2. **Tracker phase 1–2:** schema + migrations, contract + importer, cron/import + import-on-open, raw_imports, banner.
3. **Tracker phase 3+:** scope, calendar, accounts, metrics … then journal, money/rules.
4. **News:** N1–N4.
5. **Backtester:** B1–B7.

Each step: open a PR, CI green, Joe reviews the preview.
