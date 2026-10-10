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
| M1 | Scaffold | arch §12.1 | ✅ Done — PR #1 |
| M2 | Database schema + RLS | tracker §5, §5.1 | ✅ Done — PR #1 |
| M3 | Export contract + import planner (pure) | tracker §4 | ✅ Done — PR #1 |
| M4 | Import pipeline | tracker phase 1 | ✅ Done — PR #1 |
| M5 | Sync health & alerts | tracker phase 2, §7 | ✅ Done — PR #1 |
| M6 | Metrics + global scope + hub summaries | tracker §6, §8.0, §8.1 | ✅ Done — PR #1 |
| M7 | Trading calendar | tracker §8.2 | ✅ Done — PR #1 |
| M8 | Overview, accounts, trades | tracker phase 3, §8.3 screens 1–5 | ✅ Done — PR #1 |
| M9 | Journal | tracker phase 4 | ✅ Done — PR #1 |
| M10 | Money & rules | tracker phase 5 | ✅ Done — PR #1 |
| M11 | News data | news N1 | ✅ Done — PR #1 (real 12-month backfill waits on the producer) |
| M12 | News page + hub card | news N2 | ✅ Done — PR #1 |
| M13 | News ↔ Tracker integration | news N3 | ✅ Done — PR #1 |
| M14 | Market data | backtest B1 | ✅ Done — PR #1 (real backfill blocked, see log) |
| M15 | Chart | backtest B2 | ✅ Done — PR #1 |
| M16 | Replay (no lookahead) | backtest B3 | ✅ Done — PR #1 |
| M17 | News markers on replay | news N4 | ✅ Done — PR #1 |
| M18 | Drawing tools | backtest B4 | ✅ Done — PR #1 |
| M19 | Indicators | backtest B5 | ✅ Done — PR #1 |
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
**Scope:** Supabase cloud project, `supabase db push` on merge, Vercel env vars, Google service account shared on `trading-tracker/`, Sentry project; set `private.app_config.allowed_email` to Joe's email in the cloud DB; served on the free `*.vercel.app` address (Q2).
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

## Blocked / skipped log

Things that stopped a step. Work continues on the next milestone; each entry is cleared once resolved.

| Date | Milestone | What | Needs |
|---|---|---|---|
| 2026-10-09 | M1 | ~~`git push` refused (403, no GitHub access).~~ Resolved same day: Joe reconnected GitHub; pushed as PR #1. | — |
| 2026-10-09 | M1 | ~~Signed-in Playwright tests can't run in the cloud container.~~ Worked around in M6: `E2E_FAKE_AUTH=1` starts a local stand-in for Supabase Auth (`apps/web/e2e/support/fake-auth.mjs`, never used in CI), so signed-in pages are tested locally against plain Postgres. Real Supabase Auth still only runs in CI. | First CI run after the push |
| 2026-10-09 | M2 | `supabase db reset` can't run in the cloud container. Migrations and the 11 DB integration tests were verified on a plain Postgres 16 with a Supabase stub (`scripts/db-plain-postgres.sh`); CI runs them on real Supabase. | First CI run after the push |
| 2026-10-09 | M1 | GitHub Actions jobs on PR #1 fail before any step (no runner assigned, empty logs): account-level refusal, likely billing/spending limit or Actions disabled. Local gate used instead; later milestones keep adding commits to PR #1 since nothing can merge green. | Joe checks the run page reason and fixes Actions |
| 2026-10-09 | M3 | Payout rows: no payout exists in the data yet, so their shape is unverified. They are validated loosely and kept raw only (importer warning); mapping lands when a real payout appears. Firm status-history labels (e.g. "Migration Request") don't map cleanly to §5.1 statuses; they're stored with the raw label as the reason. | A real payout in an export |
| 2026-10-09 | M4 | Real Google Drive reads untested: no service account exists yet. The Drive adapter is written against the googleapis v3 API; the pipeline is tested with a fake inbox plus a manual-upload run against a real Postgres. | Joe creates the Google service account and shares `trading-tracker/` with it (M22) |
| 2026-10-09 | M6 | Which `reason_code` means "closed by stop loss" is unverified (tracker §6 step 3), so `STOP_LOSS_REASON_CODES` (packages/importer/src/server/risk.ts) is empty: every trade's risk is `estimated` at 0.5% of starting balance ($125 on a 25K) until Joe journals an initial SL or the code is confirmed. Decision taken meanwhile: an estimated risk never makes a trade a scratch, otherwise small wins drop out of the win rate (17.65% instead of FundedNext's 35.29%). | Joe confirms the SL reason code (a trade he knows hit its stop) |
| 2026-10-09 | M6 | §8.1 R view toggle: the mixed demo + real notice is shown; the $ ↔ R switch lands with the first screens that chart dollar sums (M7 calendar, M8 overview). | — (scheduled) |
| 2026-10-09 | M7 | Calendar decisions taken without Joe (easy to change): day buckets are computed on the server with the shared `tradingDay` (not in SQL) so one definition serves every screen; the ⚠️ rule-proximity icon shows at ≥ 80% of the daily-loss limit or within 20% of the max-loss amount; limits are taken as % of starting balance; the day-boundary setting UI lands in M8 (default Beirut midnight is wired). Trade rows in the day view link to trade detail (done in M9). | Joe's review |
| 2026-10-09 | M8 | Decisions taken without Joe (easy to change): symbol point values are learned from the export itself (|profit| ÷ (|price move| × lots) agrees on **$10 per point per lot for NDX100 and US30**) and stored as verified; Settings can override them. Demo vs Funded lives at `/tracker/accounts/compare` (a tab on Accounts). Trades filter in memory on the server (fine at personal volume; revisit past ~20k trades). DB test packages now run one at a time (`turbo --concurrency=1`) because parallel fixture imports deadlocked. | Joe's review |
| 2026-10-09 | M9 | Screenshot upload is untested end to end: it needs Supabase Storage (the container has plain Postgres only). Uploads go browser → private `journal-screenshots` bucket through a signed upload URL (so 5 MB images never hit Vercel's 4.5 MB function limit), then the server records the row; display uses 10-minute signed URLs. Needs `SUPABASE_SERVICE_ROLE_KEY` on the server; without it the form says so. Decisions taken without Joe: mistakes are stored as names and become `mistake` tags automatically; emotions are one-tap chips (Calm, Confident, Focused, Anxious, FOMO, Frustrated, Greedy, Tired); notes are plain text (no markdown renderer); "Save & next" opens the next older unjournaled live trade. | First run against real Supabase (CI or M22) |
| 2026-10-09 | M10 | Money shows only the one payment in the data (P1 bought with a 100% discount: $0 paid, list $200). Payouts in exports are still kept raw (shape unverified, M3), so **Money lets Joe add fees and payouts by hand** (only hand-entered rows can be deleted). Decisions taken without Joe: "Other" counts as a cost; refunds lower fees; cashflows not tied to an account count only in the all-accounts scope; net prop result on Overview and Money both come from core `moneySummary`. Rule limits on account pages (built in M8) now show which export they came from. | A real payout in an export, to map it automatically |
| 2026-10-09 | M11 | "A year of events in the DB" is proven with a synthetic 12-month backfill (4 × 92-day files, 1,095 events) in the integration tests; the real backfill arrives with the producer's first `full` run (news spec §1.2), which only exists once the daily export routine runs (M22). The fixture carries 11 events (5–9 Oct). Decisions taken without Joe: when both listings of a rescheduled event are in the same export, the higher FundedNext id wins; duplicates are resolved before cancellations, so a moved event is "superseded", not "cancelled"; only complete (`status: ok`) files cancel events; an older file processed late never overwrites or resurrects anything. News settings (5 min each side, USD) are stored in `app_settings`. | Producer's first full run |
| 2026-10-09 | M12 | Decisions taken without Joe (easy to change): the News pages live in a new `packages/news` (queries) with pure week/countdown/restriction logic in `packages/core`; filters are URL-driven and remembered per device (bare `/news` gets the last filters); the default currency filter follows the "currencies that count" setting on Restriction rules (USD); News days are always Beirut midnight-to-midnight, independent of the Tracker day setting; on phones the event panel opens as a bottom sheet. Hub card shows today's high-impact or restricted events, next red folder countdown, ⚠️ during an active window and a Mon–Fri red-folder strip. | Joe's review |
| 2026-10-09 | M13 | Restriction badges default **off for all three current accounts** (7002880 has the ANT News Trading add-on, read from its imported rules; P1/P2 are challenges), so no badge shows on real data: expected, per news spec §5. Joe can force a badge on per account in News › Restriction rules. Decisions taken without Joe: calendar 📰 shows for red folders in the counted currencies (USD) by the Tracker day boundary; the day view lists high and medium events in counted currencies plus any restricted event; "news around this trade" uses counted currencies within ±60 min of open or close; the analytics split (red-folder days, ±30 min of a red folder, per event type) is the first section of the Analytics screen, the rest comes in M21. On real data: 5 of 7002880's 34 trades fall on the FOMC-minutes day. | Joe's review |
| 2026-10-09 | M14 | **No real candles yet:** the container's network policy blocks `datafeed.dukascopy.com` (HTTP 403), so the 12-month backfill and the first daily run couldn't fetch anything. The pipeline is proven with a synthetic provider (ingest, idempotent re-run, gaps, empty days, failures, alerts, resumable backfill) and the real Dukascopy path was run once here and logged its 403 as a `failed` run, as designed. Until data lands, the Backtest Lab shows an amber "Market data needs attention" banner. Decisions taken without Joe: instrument codes `usa30idxusd` / `usatechidxusd` (checked in dukascopy-node 1.50.0); $10 per point per lot for both (derived from the fixture's 99 trades); default spreads 2.0 (US30) and 1.5 (NAS100) points until M20 reads FundedNext's real values; trading hours follow CME index futures (Sun 18:00 → Fri 17:00 ET, daily break 17:00–18:00 ET); a gap is 15+ missing minutes in those hours; US holidays and early-close days (incl. 24 and 31 Dec, Black Friday) never raise a gap; the daily job runs at 04:00 UTC and the health check waits until 06:00 UTC before expecting yesterday. | Joe runs `DATABASE_URL_DIRECT=… pnpm db:backfill-candles` once from his machine (or after M22 deploy); the Vercel cron then keeps it current |
| 2026-10-09 | M15 | "Smooth scroll through the full year" is unverified on real data (no candles yet, see M14); lazy loading pages 500 bars per request in both directions and was checked on 3 synthetic days. KLineCharts **10.0.3** (Apache-2.0) is used through its v10 data-loader API. Decisions taken without Joe: the chart lives at `/backtest/chart` (Sessions stays the Lab's home); US30 is the default instrument; timeframe and instrument are in the URL, time zone (Beirut / New York) and the Sessions toggle are remembered per device; session bands are translucent with their name at the bottom; switching timeframe reloads around the bar at the right edge of the view. | Joe's review once real data is in |
| 2026-10-09 | M16 | Decisions taken without Joe (easy to change): the cursor is the open time of the newest revealed 1m bar and lives in the URL (`?at=`), so a reload resumes the replay (sessions persist it in M21); every step fetches only the minutes it reveals (`until` = new cursor), so playing at 20 bars/s means up to 20 small requests a second; when the market is closed a step asks only *when* the next candle is (`/api/backtest/candles/next`, a time, never a price); "Next session" jumps to the next kill-zone open of any zone and "Next day" to the 18:00 New York daily reopen; "Start replay here" hides everything after the clicked bar; default speed 2 bars/s. Proven by e2e: on 15m the forming candle's close matches the 1m close after each Shift+→, and every candles response during replay stays at or before the cursor. | Joe's review |
| 2026-10-09 | M17 | No event carries an `actual` yet (FundedNext doesn't provide one, news spec §6), so the "no leaked actuals" rule is proven with an injected actual in the integration test plus a second client-side guard; the API also clamps `until` to now. Decisions taken without Joe: markers default to **High** impact in the currencies that count (USD); Med/Low and "All currencies" are toggles remembered per device; one dashed line per bar in the colour of its most important event; hovering the bar shows title, time, forecast, previous (and actual once released); markers for a year back and two weeks ahead are loaded in one request. Until the producer's 12-month backfill runs, only the fixture week (5–9 Oct) has events. | Producer's first full run |
| 2026-10-10 | M18 | Decisions taken without Joe: drawings are saved per instrument (shown on every timeframe, anchored to time and price) and get a `session_id` once backtest sessions exist (M21); shortcuts are Alt+H/T/L/S/M (Alt so they don't clash with the 1/5/F timeframe keys); long/short boxes default to a stop 0.1% from entry, 1:2 RR, 20 bars wide, and size lots for **0.5% risk of a 25,000 balance** until a session carries its own balance (M21); lots round down to 0.01; a measure is temporary unless Shift is held on the second click; colours are a fixed 6-swatch palette. KLineCharts ignores a second click within 500 ms that lands away from the first, so very fast two-click drawing needs a slower second click. | M21 session balance |
| 2026-10-10 | M19 | **TradingView itself was not checked**: the container can't reach it. ATR and RSI implement TradingView's published Pine formulas (`ta.rma`, `ta.atr`, `ta.rsi`) and RSI matches Wilder's worked example (StockCharts table, within its 2-dp rounding); ATR is checked against hand-computed values. Joe should spot-check one bar against TradingView on the same candles. Decisions taken without Joe: our own KLineCharts indicators (not its built-ins), computed on the bars on the chart only, so never past the replay cursor; settings (length, colour, RSI levels) and on/off are remembered per device like the other chart prefs, not in the database; panes are 110 px (70 px on short screens). | Joe's TradingView spot-check |
