# Milestones — Trading App

The whole app, in build order, as milestones Claude Code works through one at a time.
Specs decide **what**; `docs/specs/tech-architecture.md` decides **how**. Each milestone maps to a phase in a spec (column "Spec").

## How every milestone runs

1. Branch `m<N>-<slug>` from `main`.
2. Build only the milestone's scope.
3. **Gate — all must pass locally before the commit:**
   - `pnpm lint` · `pnpm typecheck` · `pnpm test` (coverage ≥ 80% lines for `core`, `contract`, `indicators`, `backtest-engine`) · `pnpm boundaries` · `pnpm build`
   - `pnpm test:e2e` (Playwright, desktop + phone viewport)
   - Once migrations exist (M2+): `supabase db reset` and the DB integration tests
   - The milestone's own **Done when** check below
4. Commit (Conventional Commits), push, open a PR; CI green; Joe reviews the Vercel preview; merge.
5. Tick the milestone here and the matching phase in its spec.

A milestone marked **⛔ Blocked** needs an answer from Joe (see "Open questions") before that part starts. Work that doesn't depend on the answer can still go ahead.

## Status

| # | Milestone | Spec | State |
|---|---|---|---|
| M1 | Scaffold | arch §12.1 | In progress |
| M2 | Database schema + RLS | tracker §5, §5.1 | Not started |
| M3 | Export contract + import planner (pure) | tracker §4 | Not started |
| M4 | Import pipeline | tracker phase 1 | Not started |
| M5 | Sync health & alerts | tracker phase 2, §7 | Not started |
| M6 | Metrics + global scope + hub summaries | tracker §6, §8.0, §8.1 | Not started |
| M7 | Trading calendar | tracker §8.2 | Not started |
| M8 | Overview, accounts, trades | tracker phase 3, §8.3 screens 1–5 | Not started |
| M9 | Journal | tracker phase 4 | Not started |
| M10 | Money & rules | tracker phase 5 | Not started |
| M11 | News data | news N1 | Not started |
| M12 | News page + hub card | news N2 | Not started |
| M13 | News ↔ Tracker integration | news N3 | Not started |
| M14 | Market data | backtest B1 | Not started |
| M15 | Chart | backtest B2 | Not started |
| M16 | Replay (no lookahead) | backtest B3 | Not started |
| M17 | News markers on replay | news N4 | Not started |
| M18 | Drawing tools | backtest B4 | Not started |
| M19 | Indicators | backtest B5 | Not started |
| M20 | Simulated trading | backtest B6 | Not started |
| M21 | Sessions, analytics, live vs backtest | backtest B7, tracker phase 6 | Not started |
| M22 | Production launch | arch §9, §11 | Not started |

---

## M1 · Scaffold
**Scope:** pnpm + Turborepo, `apps/web` (Next.js App Router), `packages/config|core|db`, Biome, dependency-cruiser, Vitest, Playwright, Sentry, env validation, local Supabase config, magic-link auth limited to `ALLOWED_EMAIL`, app shell: hub + three module layouts with their own nav and empty pages, GitHub Actions CI.
**Done when:** signed-out visits to any page redirect to `/login`; a non-allowed email is refused; the hub and every module route render on phone and desktop; the gate passes in CI.

## M2 · Database schema + RLS
**Scope:** Drizzle schema in `packages/db/src/schema/*` for every tracker §5 table (accounts, cycles, trades, raw_imports, sync_health, alerts_log, payments, payouts, rule snapshots, journal, tags), account status (§5.1), indexes (arch §5), RLS migrations, live-trade delete guard, seed.
**Done when:** `supabase db reset` applies cleanly; integration tests prove RLS denies a non-allowed user and deleting a `source = 'live'` trade is refused.

## M3 · Export contract + import planner (pure)
**Scope:** `packages/contract` (zod schema v1, fixture copied from `docs/specs/fixtures/`), parsing of `rr_ratio`, `lots`, side, server-time UTC+03:00 strings; `packages/importer` pure part: contract → upsert plan, checksum recompute and account rejection (CLAUDE.md rules 13–14).
**Done when:** the fixture parses to 3 accounts / 99 trades with net −1,344.71, +1,251.91, +2,038.51; a tampered trade makes its account rejected; coverage ≥ 80%.

## M4 · Import pipeline  *(tracker phase 1 complete)*
**Scope:** Drive reader (server-only), `/api/cron/import` (CRON_SECRET, idempotent, Sentry), move file to `processed/`, `raw_imports`, import-on-open via `after()`, Settings › Imports manual upload + "Sync now", `scripts/reprocess-imports.ts`, `vercel.json` crons.
**Done when:** the fixture imports cleanly; importing it again changes no rows (integration test); cron without the secret gets 401.

## M5 · Sync health & alerts  *(tracker phase 2)*
**Scope:** all §7 conditions, staleness rule (26 h, Sat→Tue gap normal), red banner on every page, recovery message, `notify(channel, alert)` with in-app channel only, 12 h anti-spam, `alerts_log`, "Run health check" + "Send test alert".
**Done when:** missing file, unshared folder and malformed file each show the right banner on next page load (tests per condition, with clock injection).

## M6 · Metrics + global scope + hub summaries
**Scope:** `packages/core/metrics` (R, win rate, breakeven win rate, PF, expectancy, drawdown — §6), risk resolution order, status mapping, session bucketing by kill zone with an "Outside" bucket (Q7), day bucketing in Asia/Beirut across DST; scope selector via nuqs (§8.1); hub cards with live summaries (§8.0).
**Done when:** metric unit tests match FundedNext's stats for the current cycle (win rate 35.29%, PF 0.5); switching scope changes the URL and every Tracker header.

## M7 · Trading calendar
**Scope:** the §8.2 calendar as one component taking a scope; day view.
**Done when:** full §8.2 feature list works on phone and desktop against fixture data; day totals equal the metrics package output.

## M8 · Overview, accounts, trades  *(tracker phase 3 complete)*
**Scope:** screens 1–5: Overview, Accounts (journeys P1 → P2 → Funded, status badges, lifecycle timeline), Account detail tabs, Demo vs Funded, Trades table with filters + CSV export; symbol point values; day-boundary setting.
**Done when:** tracker phase 3 "Done when" holds from real imported data.

## M9 · Journal  *(tracker phase 4)*
**Scope:** screens 5–6 and 10, tags, screenshots (private bucket, signed URLs), react-hook-form + zod, mobile polish.
**Done when:** Playwright on a phone viewport journals a trade in under 60 s of interaction.

## M10 · Money & rules  *(tracker phase 5)*
**Scope:** screen 9, rule snapshots + proximity on account pages.
**Done when:** net prop result (payouts − fees) shown; rule limits come from imported data.

## M11 · News data  *(news N1)*
**Scope:** contract `news` section, `economic_events`, dedupe/reschedule logic, 12-month backfill.
**Done when:** a year of events in the DB; duplicates hidden; re-import idempotent.

## M12 · News page + hub card  *(news N2)*
**Scope:** `/news` week view, history, rules pages; hub card; USD events only (Q4).
**Done when:** this week's USD red folders readable on a phone in one screen.

## M13 · News ↔ Tracker integration  *(news N3)*
**Scope:** calendar icons, day view list, trade detail "news around this trade", restriction-window badges (window is a setting, default 5 min each side — Q3), news vs non-news analytics split.
**Done when:** news-day vs non-news-day stats render from real data.

## M14 · Market data  *(backtest B1)*
**Scope:** `instruments`, `candles_1m`, `packages/market-data` provider + Dukascopy implementation (Q5), `scripts/backfill-candles.ts`, `/api/cron/candles`, gap check + alert.
**Done when:** 12 months of 1m candles for US30 and NAS100; yesterday's candles appear automatically; a failed run raises an alert.

## M15 · Chart  *(backtest B2)*
**Scope:** KLineCharts adapter, instrument switch, 1m/5m/15m, lazy loading, crosshair, session shading (kill zones, Q7).
**Done when:** smooth scroll through the full year on desktop; 5m/15m match aggregation of 1m (unit test).

## M16 · Replay  *(backtest B3)*
**Scope:** `packages/backtest-engine` cursor + aggregation, controls, forming candles, `/api/backtest/candles` requiring `until`.
**Done when:** a test proves no request returns data after the cursor; the 15m forming candle updates minute by minute.

## M17 · News markers on replay  *(news N4)*
**Done when:** event markers show on the replay chart without leaking future actuals.

## M18 · Drawing tools  *(backtest B4)*
**Done when:** horizontal, trend, long, short, measure drawings survive reload and timeframe switches at the same time/price.

## M19 · Indicators  *(backtest B5)*
**Scope:** `packages/indicators` ATR, RSI with settings.
**Done when:** values match TradingView reference values for a sample window (unit tests).

## M20 · Simulated trading  *(backtest B6)*
**Scope:** place from position tool, deterministic fills (SL-first on ambiguity, gaps), cost model mirroring FundedNext's spread/commission per instrument (Q6), record into `trades` as `source = 'backtest'`, delete + undo.
**Done when:** a full session's trades appear in the tracker calendar, stats and journal under the Backtest scope.

## M21 · Sessions, analytics, live vs backtest  *(backtest B7 + tracker phase 6)*
**Scope:** session management + resume, screens 7–8.
**Done when:** Joe can resume a session; live vs backtest R compares per symbol.

## M22 · Production launch
**Scope:** Supabase cloud project, `supabase db push` on merge, Vercel env vars, Google service account shared on `trading-tracker/`, Sentry project; served on the free `*.vercel.app` address (Q2).
**Done when:** the daily cron imports the real inbox in production and the hub shows today's sync status.

---

## Open questions (asked in the project chat)

| # | Question | Blocks | Source |
|---|---|---|---|
| Q1 | ✅ Dropped: no Excel backtest files exist, no importer | — | tracker App. B.1 |
| Q2 | ✅ Free `*.vercel.app` address, no custom domain | — | tracker App. B.2 |
| Q3 | ✅ 5 min before/after high-impact events, stored as a setting (verified against FundedNext's help centre: funded account only, 40% profit split, instrument-correlated events only) | — | news §8.1 |
| Q4 | ✅ USD only | — | news §8.2 |
| Q5 | ✅ Dukascopy confirmed | — | backtester §11.1 |
| Q6 | ✅ Costs mirror FundedNext (exact values read from FundedNext's instrument data at M20) | — | backtester §11.2 |
| Q7 | ✅ Kill zones, America/New_York: Asia 20:00–00:00, London 02:00–05:00, NY AM 09:30–12:00, NY PM 13:30–16:00. Same zones drive tracker session stats; trades outside every zone go in an "Outside" bucket (M6) | — | backtester §11.3 |
| Q8 | ✅ Keep the header shortcut between modules | — | tracker §8.0 |

Answers go into the relevant spec's "Decided" line, then the ⛔ comes off here.
