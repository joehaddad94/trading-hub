# Trading Tracker — Build Spec

> Personal web app that keeps a permanent, combined record of every prop-firm account Joe trades, survives account breaches/resets, and adds a trading journal on top.
> **Audience:** Claude Code (the builder). Read this whole file before writing code.
> **Owner:** Joe (single user). **Status:** Not started. **Pace:** No rush — build phase by phase, each phase shippable.

---

## 0. TL;DR for the builder

- Build a **Next.js (App Router, TypeScript) app on Vercel** with **Supabase** (Postgres + Auth + Storage).
- The app **never talks to FundedNext, cTrader, or any trading platform.** It only reads JSON export files that land in a **Google Drive folder** Joe owns.
- Those export files are produced **outside this codebase** by a daily **claude.ai scheduled task** that uses the FundedNext MCP connector (see §3 and Appendix A). You (Claude Code) do **not** build or run that producer — you build the consumer and must honour the JSON contract in §4 exactly.
- If the sync stops for **any** reason, Joe must be **notified** (§7). This is a hard requirement, not a nice-to-have.
- Never delete account or trade data. Accounts that are breached/passed/merged stay forever.

---

## 1. Problem & goals

**Problem:** Each time a prop account is breached, passed, or replaced, its history becomes hard to reach or disappears, so Joe can't measure progress over time.

**Goals (in priority order):**
1. Permanent per-account history that outlives the account at the firm.
2. Combined view across all accounts over time (one equity curve, one stats view).
3. Fully automatic data capture — zero manual steps for trade data.
4. Optional full journal per trade (notes, tags, emotions, screenshots) on phone and desktop.
5. Money in vs. out (challenge fees, resets, payouts) → real net result of prop trading.
6. Firm rule limits per account (daily loss / max drawdown) and how close Joe came to them.
7. Backtest trades stored alongside live trades for live-vs-backtest comparison.
8. Alert Joe whenever the sync is broken or stale.

**Non-goals (v1):** placing trades, real-time intraday risk protection (sync is daily — see §11), multi-user, selling the product, connecting to cTrader/MT5 directly.

**Known insight the app must make visible:** Joe passed both demo phases at a profit (P1 ≈ +$2,038, P2 ≈ +$1,252 on 25K) but the funded (real) account is ≈ −$1,345. A **phase-by-phase comparison** (demo vs funded) is a first-class feature, not an afterthought.

---

## 2. Stack & hosting

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15+ (App Router), TypeScript strict | Server actions + route handlers. No separate NestJS backend — single deployable. |
| Hosting | Vercel (Hobby) | Daily crons only + import-on-open — see `tech-architecture.md` §6. |
| DB | Supabase Postgres | Migrations checked into repo. |
| ORM | **Drizzle** | Decided — see `tech-architecture.md`. |
| Auth | Supabase Auth, magic link or passkey | **Single allowed email** (env `ALLOWED_EMAIL`). Everyone else rejected. |
| File storage | Supabase Storage | Journal screenshots. Private bucket, signed URLs. |
| Drive access | Google Drive API via **service account** | Joe shares the drop folder with the service-account email (read + write so files can be moved to `processed/`). |
| Error tracking | Sentry (free tier) | Why something failed; the banner shows that it failed. |
| Later alert channels | Email (Resend), Telegram | Not in v1 (§7). |
| Charts | Recharts or similar | Equity curves, distributions. |
| UI | Tailwind + shadcn/ui | Must be fully usable on a phone (journal is entered on mobile and desktop). |

**Secrets (Vercel env, never committed):** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_INBOX_FOLDER_ID`, `DRIVE_PROCESSED_FOLDER_ID`, `ALLOWED_EMAIL`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `TELEGRAM_BOT_TOKEN` (opt), `TELEGRAM_CHAT_ID` (opt), `CRON_SECRET`.

---

## 3. Data pipeline (the core architecture)

```
┌──────────────────────────────┐      ┌────────────────────────┐      ┌───────────────────────────┐
│ claude.ai scheduled task      │      │ Google Drive (Joe's)   │      │ Next.js app on Vercel     │
│ (daily, NOT in this repo)     │ ───▶ │ /trading-tracker/inbox │ ───▶ │ Vercel Cron: /api/import  │
│ uses FundedNext MCP connector │ JSON │ /trading-tracker/      │ read │ upsert → Supabase Postgres│
│ writes export + status file   │      │   processed            │ move │ staleness check → alerts  │
└──────────────────────────────┘      └────────────────────────┘      └───────────────────────────┘
                                                                         ▲
                                                 manual fallback:        │
                                                 "Upload JSON/CSV" page ─┘
```

**Why this shape:** Joe's requirement is that the app never accesses trading platforms. The claude.ai scheduled task is the only component with FundedNext access. Its sandbox can't reliably POST to arbitrary URLs, so Google Drive is the handoff.

**Producer schedule:** 00:20 Asia/Beirut, **Tuesday–Saturday only** (each run covers the previous trading day, Mon–Fri; Joe does not trade weekends). No files arrive Sunday or Monday by design.
**Consumer schedule (Vercel Hobby — daily crons only; details in `tech-architecture.md` §6):**
- `/api/cron/import` — **daily** (`0 23 * * *` UTC, after the producer's file lands); also runs the staleness checks.
- **Import-on-open:** opening the app imports any new inbox file (throttled to once per 10 min).
- **Staleness checks** also run on every page load to drive the banner (§7). No separate staleness cron.

**Producer guarantees (contract with the scheduled task):**
- Writes **exactly one file per run**, even when there are no new trades (acts as a heartbeat).
- On any tool failure it still writes a file with `"status": "error"` and an `errors[]` array.
- File name: `fundednext_<YYYY-MM-DD>_<HHmm>Z.json` (UTC). Never overwrites.

---

## 4. Export file contract (JSON) — `schema_version: 1`

The consumer must validate with **zod** and reject (and alert on) anything that doesn't match. Store every file verbatim in `raw_imports` before parsing.

```jsonc
{
  "schema_version": 1,
  "source": "fundednext-mcp",
  "generated_at": "2026-10-10T21:20:00Z",
  "mode": "full" | "incremental",          // first run = "full" (backfill); then "incremental"
  "status": "ok" | "partial" | "error",
  "errors": [ { "step": "get_trading_history", "account_id": 4288969, "message": "..." } ],

  "accounts": [
    {
      "firm": "FundedNext",
      "external_id": 4288969,               // FundedNext internal account id
      "login": 7002880,
      "parent_external_id": 4205162,        // from get_parent_account, null if none
      "bucket": "active" | "inactive" | "breached",
      "type_label": "Stellar 2-Step Real Account | 25K",
      "plan": { "id": 82, "type": "Evaluation Real", "title": "...", "next_plan": 82, "starting_balance": 25000, "leverage": 100 },
      "platform": "ctrader",
      "starting_balance": 25000,
      "balance": 23655.29,
      "equity": 23655.29,
      "breached": false,
      "breached_by": null,                  // e.g. "Profit Target Reached", or a rule-violation reason
      "status_history": [ /* raw get_account_status_history rows */ ],
      "overview": { /* raw get_account_overview payload */ },
      "rules": { /* raw get_account_applicable_rules + get_risk_parameters payloads */ },
      "cycles": [
        {
          "external_id": 5734057,
          "reason": "New Cycle",
          "created_at": "2026-09-24 16:32:33",
          "ending_at": "2026-10-14 23:45:00",
          "stats": { "total_trades": 34, "profit_factor": 0.5, "average_win_loss_trade": 0.92, "win_rate": 35.29 },
          "trades": [ /* ALL trades in the cycle, all pages merged — see trade shape below */ ]
        }
      ]
    }
  ],

  "cashflows": {
    "payments": [ /* raw get_payment_history rows (challenge fees, resets) */ ],
    "payouts":  [ /* raw get_payout_history_v2 rows */ ]
  },

  "news": { /* economic calendar — see news-spec.md §1.2 */ }
}
```

**Trade shape** (verbatim from FundedNext `get_trading_history`; observed sample):

```json
{
  "id": 400685324, "ticket": "M8699065335386020", "symbol": "US30",
  "type": 0, "type_str": "Buy", "lots": "0.21", "volume": 210,
  "open_price": 51392.41, "close_price": 51330.8,
  "open_time": 1791563780, "close_time": 1791564063,
  "open_time_str": "2026-10-09 16:36:19", "close_time_str": "2026-10-09 16:41:02",
  "sl": 51332.44, "tp": 0, "profit": -129.38, "commission": 0, "swap": 0,
  "pips": "-6161.000000", "reason": 4, "is_news": 0, "news_trades": null,
  "pnl_percentage": -0.52, "trade_duration": "0:04:43", "rr_ratio": "1:1.03"
}
```

**Verified in the Phase 0 test export (9 Oct 2026) — these override anything below:**
- **Trade times:** `open_time_str` / `close_time_str` are **FundedNext server time, UTC+03:00** (file field `firm_server_time_offset`). Evidence: Joe's entries cluster at 16:30, which is the NY cash open (13:30 UTC). Convert with that offset: `16:36:19` server = `13:36:19Z`. The unix `open_time`/`close_time` returned by `get_trading_history` equal the server-time string read as if it were UTC, so they are **3 hours off — do not use them**. Store `firm_server_time_offset` per file; whether the server shifts to +02:00 in winter is unknown — re-check after the late-October/November clock change (if 16:30 entries start appearing at 17:30, the server did not shift).
- **News times:** `timestamp` in the news calendar **is true UTC** (FOMC Minutes = 18:00Z, CAD jobs = 12:30Z).
- **Past-cycle trades** (`get_cycle_trading_history`) come in a reduced shape: ticket, symbol, type, lots, open/close price, profit, swap, commission, open/close time strings, is_news. `sl`, `tp`, `rr_ratio`, `reason`, `pnl_percentage` and unix times are **optional** in the contract.
- **Tickets** can be strings (`"M8699…"`) or numbers (`3083824`) → always store as text.
- **Checksums:** each file carries `checksums[login] = {trade_count, sum_profit, balance_change, match}`. The importer **recomputes** `Σ(profit+swap+commission)` per single-cycle account and compares it with `balance − starting_balance`; a mismatch rejects that account's trades and raises the banner. This guards against transcription errors, because the producer (an AI scheduled task) re-types the data into the file.
- **Incremental files** list every account but only include trades for active accounts and accounts with a trade in the last 14 days; accounts with `cycles: []` are **not** cleared.
- **Account chain:** `get_parent_account` is about payout wallets, not phases. `parent_external_id` is inferred by the producer (same size, `plan.next_plan` chain, start right after the parent passed) and may be null; the app lets Joe link phases manually in Accounts.
- **Funded account rules seen:** Daily Loss Limit 5%, Max Loss Limit 10%, and the **News Trading Allowed add-on** — so restricted news events may not apply to this account (News module §5 setting).
- **News lookahead:** next week's calendar is only published around the weekend, so the 14-day lookahead is often shorter.
- `type`: `0 = Buy`, `1 = Sell`.
- `lots` is a **string** → parse to `numeric`.
- `sl` / `tp` = **final** values at close, not the initial stop (winners show SL trailed to near the exit). **Do not compute R from `sl`.** See §6.
- `pips` values look scaled (×100); don't trust — compute points as `|close_price − open_price|`.
- `rr_ratio` is a string like `"1:1.03"` or null → parse to numeric `1.03`; store raw too. Meaning is not fully confirmed — label it "firm-reported RR" in the UI.
- `reason` codes (1, 4, …) are undocumented → store raw integer, don't interpret.
- `0` for `sl`/`tp` means "not set" → store `null`.
- Dedupe key: **(firm, account external_id, ticket)**. Re-importing the same trade = update, never duplicate.
- Observed contract value for US30 and NDX100 on this account: **P/L ≈ points × lots × 10 (USD)**. Store a per-symbol `point_value` table and verify against imported trades; don't hard-code.

---

## 5. Database schema (Postgres)

All tables: `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. Enable **RLS on every table**; policy = authenticated user whose email = `ALLOWED_EMAIL`. Import/cron jobs use the service role server-side only.

| Table | Key columns | Notes |
|---|---|---|
| `firms` | `name` unique | Seed `FundedNext`. Future: FundingPips etc. |
| `accounts` | `firm_id`, `external_id` (unique per firm), `login`, `parent_account_id` (fk self), `phase` enum(`p1`,`p2`,`funded`,`instant`,`other`), `is_demo` bool, `platform`, `type_label`, `plan_raw` jsonb, `starting_balance`, `status` (see §5.1), `status_reason` (firm's raw text), `status_changed_at`, `default_risk_pct` numeric default 0.5, `first_seen_at`, `last_seen_at`, `closed_at` | **Never delete.** Derive `phase`/`is_demo` from `plan.type` ("Evaluation P1/P2" = demo, "Evaluation Real" = funded). |
| `account_status_history` | `account_id`, `status`, `status_reason`, `changed_at`, `source` enum(`firm_history`,`detected_on_import`), `raw` jsonb | Full lifecycle per account. Seeded from the firm's status history; a new row is also written whenever an import sees the status change. |
| `account_journeys` | `name`, `root_account_id` | A P1→P2→Funded chain viewed as one journey (walk `parent_account_id`). Can be a view instead of a table. |
| `cycles` | `account_id`, `external_id` unique, `reason`, `started_at`, `ends_at`, `stats_raw` jsonb | |
| `trades` | `account_id`, `cycle_id` (nullable), `source` enum(`live`,`backtest`), `ticket`, `symbol`, `side` enum(`buy`,`sell`), `lots`, `volume`, `open_price`, `close_price`, `opened_at`, `closed_at`, `sl_final`, `tp_final`, `profit`, `commission`, `swap`, `net_profit` (generated), `firm_rr_raw`, `firm_rr`, `is_news`, `reason_code`, `raw` jsonb | Unique `(account_id, ticket)` for live. Backtest trades: `account_id` → a synthetic "Backtest – US30/NAS100" account. |
| `balance_snapshots` | `account_id`, `taken_at`, `balance`, `equity` | One per account per import. |
| `rule_snapshots` | `account_id`, `taken_at`, `daily_loss_limit`, `max_loss_limit`, `profit_target`, `raw` jsonb | Exact limits come from the firm data, never hard-coded. |
| `cashflows` | `firm_id`, `account_id` (nullable), `kind` enum(`challenge_fee`,`reset_fee`,`addon`,`payout`,`refund`,`other`), `amount_usd` (fees negative, payouts positive), `occurred_at`, `external_ref` unique, `raw` jsonb | |
| `journal_entries` | `trade_id` unique, `setup_tag_id`, `followed_plan` bool, `planned_rr` numeric, `planned_risk_usd` numeric, `emotion_before`, `emotion_after`, `mistakes` text[], `notes` text (markdown), `rating` 1-5 | One per trade, optional. |
| `tags` | `name`, `kind` enum(`setup`,`mistake`,`context`) | User-managed. |
| `trade_tags` | `trade_id`, `tag_id` | Many-to-many. |
| `screenshots` | `trade_id`, `storage_path`, `caption` | Supabase Storage, private. |
| `daily_notes` | `date` unique, `notes`, `mood`, `market_context` | Session-level journal (not per trade). |
| `raw_imports` | `drive_file_id` unique, `file_name`, `generated_at`, `schema_version`, `status`, `errors` jsonb, `payload` jsonb, `imported_at`, `import_result` enum(`ok`,`partial`,`failed`,`rejected`), `import_error` | Every file kept verbatim → can reprocess after schema changes. |
| `sync_health` | single row: `last_file_at`, `last_ok_import_at`, `last_alert_at`, `consecutive_failures` | Drives §7. |
| `alerts_log` | `kind`, `message`, `sent_at`, `channel` | Avoid alert spam (see §7). |
| `symbol_specs` | `firm_id`, `symbol`, `point_value_per_lot` | Verified from data. |

Provide a `scripts/reprocess.ts` that rebuilds all derived tables from `raw_imports`.

### 5.1 Account status

Every account always has exactly one current status, shown as a coloured badge everywhere the account appears (scope selector, accounts list, account detail, trades table, calendar previews and day view).

| Status | Meaning | Derived from (FundedNext) | Badge |
|---|---|---|---|
| `active` | Trading allowed now | bucket `active`, `breached = 0` | blue |
| `passed` | Phase target hit, moved to next phase | bucket `inactive`, `breachedby = "Profit Target Reached"` | green |
| `breached` | Failed a rule (daily loss, max loss, etc.) | bucket `breached` (rule violation); keep the exact rule in `status_reason` | red |
| `merged` | Combined into another account | `breachedby` contains "merge" | grey |
| `paused` | Paused by firm or user | `breachedby` contains "Pause" or pause status says paused | amber |
| `closed_other` | Inactive for any other reason | any other inactive reason; keep raw text | grey |
| `missing` | Previously seen, absent from latest export, no known status change | set by the importer; also triggers an alert (§7) | amber outline |

Rules:
- Map unknown firm reasons to `closed_other` and keep the raw text — never drop it.
- Status changes are written to `account_status_history`; the account detail page shows this as a **lifecycle timeline** (created → passed P1 → P2 started → passed P2 → funded → …).
- The scope selector (§8.1) can filter by status (e.g. "Active only", "All breached").
- The Accounts screen groups by journey and shows, per account: status badge, status reason, phase, start → end dates, final balance, net P/L, trades, win rate.

---

## 6. Metrics definitions (must be consistent everywhere)

- **Net P/L per trade** = `profit + commission + swap`.
- **Risk per trade (USD)** — risk varies per trade and FundedNext's data does **not** contain the initial stop loss (`sl` is the final value; order history returned no lifecycle data when tested). So risk is resolved in this order, and every trade stores which method was used (`risk_source` enum: `journal_sl`, `journal_usd`, `full_stop_loss`, `estimated`):
  1. **`journal_sl`** — Joe enters the **initial stop price** in the journal (one field, mobile-friendly). Risk = `|entry − initial_sl| × lots × point_value_per_lot`. Exact. This is the preferred path.
  2. **`journal_usd`** — Joe enters risk in $ directly.
  3. **`full_stop_loss`** — a losing trade closed by SL (`reason_code` indicates SL hit, final SL not moved into profit) → risk = `|net loss|`. Exact for clean full-stop losses. Verify which `reason_code` means SL hit from the data before relying on it.
  4. **`estimated`** — otherwise: median risk of that account's `full_stop_loss` trades in the trailing 30 days (fallback: 0.5% of starting balance). Shown with an "est." badge.
- Add `journal_entries.initial_sl` (numeric) and `trades.risk_usd`, `trades.risk_source`.
- The trade list and calendar day view show a small "risk missing" marker on trades still on `estimated`, so Joe can fill the initial SL when journaling.
- Stats screens show the share of trades with exact vs estimated risk.
- **R-multiple** = `net P/L / risk per trade`.
- **Win** = net P/L > 0; **scratch** = |R| < 0.1 (configurable) — report scratches separately, don't count them as wins.
- **Win rate, avg win R, avg loss R, expectancy (R)**, **profit factor** = gross wins / |gross losses|.
- **Breakeven win rate** for a given avg win R = `1 / (1 + avgWinR)` — show next to actual win rate.
- **Max drawdown** per account (from balance snapshots + trade sequence) and **combined**.
- **Sessions** (computed in America/New_York time): Asia, London, NY AM (09:30–12:00 ET), NY PM. Display times in Asia/Beirut.
- **Combined equity curve** = cumulative net P/L across all live accounts in close-time order (starting at 0), with account boundaries marked.
- **Net prop result** = Σ payouts − Σ fees (from `cashflows`) — the "am I actually making money" number.
- **Rule proximity** = worst intraday-to-daily-snapshot distance to daily-loss and max-loss limits per account. Label clearly as based on daily data.

---

## 7. Sync-failure notifications (hard requirement)

Joe must be told whenever data stops flowing, for **any** reason. Two independent layers:

**Layer A — producer side (configured in claude.ai, not in this repo):** the scheduled task has push + email notifications enabled for each run.

**Layer B — consumer side (build this):** a dead-man's switch in the app. The checks run inside the daily import job **and on every page load**, and raise an alert when **any** of these is true:

| Condition | Alert |
|---|---|
| No new file **26 h after an expected run** (expected runs: Tue–Sat 00:20 Beirut; Sun/Mon have none, so the gap Sat → Tue is normal) | "Expected sync file is missing — scheduled task may be broken or paused." |
| Latest file has `status: "error"` or `"partial"` | Include `errors[]` content. |
| File failed zod validation / unknown `schema_version` | "Export format changed — import rejected." |
| Import threw (DB error, Drive auth error) | Include error message. |
| Drive API auth fails (service account revoked / folder unshared) | "App can't read Drive folder." |
| An account seen yesterday is missing today without a status change | "Account X disappeared from export." |

**Delivery (v1 — Joe's decision): in-app banner only.** A red banner on every page while unhealthy, with the condition, since when, and a link to Imports & Health. Build the alert layer behind a `notify(channel, alert)` interface so **email (Resend) and Telegram can be added later** without touching detection logic. Until then, `RESEND_*` / `TELEGRAM_*` env vars are unused. Known trade-off: Joe only learns about a broken sync when he opens the app.
**Anti-spam:** one alert per condition per 12 h; a "recovered" message when a good import arrives after a failure. Log every alert in `alerts_log`.
**Test hook:** a "Run health check" and "Send test alert" button in Settings › Imports.
Vercel Cron routes must check `Authorization: Bearer ${CRON_SECRET}`.

---

## 8. App screens

### 8.0 App shell & module navigation (Joe's decision: module hub)

The app has **three separate modules**: **Tracker** (includes the Journal), **News** (`news-spec.md`), **Backtest Lab** (`backtester-spec.md`). They are separated at the top level by a **hub page**, not mixed into one menu. It is a **responsive web app**: every screen works on desktop and phone.

**After login → Hub (`/`)**
- Greeting + sync status line ("Synced today, 00:20", or the red sync-failure banner from §7).
- **Three module cards**, each with a live summary and an "Open" action:
  - **Tracker** — current month net P/L (scope: all live accounts), green days / trading days, trades waiting to be journaled, active account + balance.
  - **News** — today's USD red folders (or "No high-impact USD news today") and any restricted event today.
  - **Backtest Lab** — last session + its result, or "No sessions yet"; "Best on desktop" note on phones.
- Settings link. Desktop: cards in a row; phone: stacked.

**Inside a module**
- Each module has **its own navigation and only its own pages**:
  - **Tracker** — Overview (the old Dashboard), Calendar, Trades, Journal (badge = trades not journaled), Accounts, Analytics, Money. Desktop: left sidebar. Phone: bottom tab bar (Overview, Calendar, Trades, Journal, More).
  - **News** — Week view, Event history, Restriction rules. Desktop: left sidebar. Phone: top tabs.
  - **Backtest Lab** — its own full-screen layout (chart, tools, session panel); no app sidebar. Phone: sessions and results only; replay shows "best on desktop".
- **Header in every module:** logo / app name → **back to the hub**; current module name; module-specific controls (Tracker: the account scope selector §8.1; News: "Calendar last synced"; Backtest: session picker).
- **Direct jump (shortcut):** a small module menu in the header (desktop) / in the hub-back menu (phone) lists the other two modules, so moving Tracker → News doesn't require going through the hub. Remove if Joe prefers strict hub-only navigation.
- Cross-module links stay as deep links (e.g. Tracker calendar day 📰 → News week view for that date; trade detail "news around this trade" → the event in News; backtest trade → its journal entry in Tracker).

**Routes**
- `/` hub · `/tracker` (overview), `/tracker/calendar`, `/tracker/trades`, `/tracker/trades/[id]`, `/tracker/journal`, `/tracker/accounts`, `/tracker/accounts/[login]`, `/tracker/analytics`, `/tracker/money` · `/news`, `/news/history`, `/news/rules` · `/backtest`, `/backtest/[session]`, `/backtest/[session]/replay` · `/settings`, `/settings/imports`.

**Code structure**
- One Next.js app, one database, one login. Folders: `src/modules/tracker`, `src/modules/news`, `src/modules/backtest`, plus `src/shared` (accounts, trades, scope, metrics, UI shell). **Modules import only from `shared`, never from each other.**
- Route groups per module, each with its own `layout.tsx` (its own nav); the hub has its own layout.

**Visual reference:** design canvas "Module Navigation Options", Option C (phone + desktop).

### 8.1 Global account scope (applies to every Tracker screen)

Every trade belongs to exactly one account (`trades.account_id` is **NOT NULL**, FK to `accounts`). Joe must be able to see **all trades** or **filter by account** everywhere, so filtering is one shared mechanism, not per-page logic.

- A **scope selector** in the Tracker header, visible on every Tracker page (not on the hub or in News; Backtest Lab uses its session picker instead). Options:
  - **All live accounts** (default)
  - **Single account** (searchable by login / label, shows status badge)
  - **Journey** (one P1 → P2 → Funded chain)
  - **Demo only** / **Funded only**
  - **Backtest** (separate — never mixed into live by default)
  - **Custom multi-select** of accounts
- Scope lives in the **URL query string** (e.g. `?scope=account:7002880`, `?scope=journey:<id>`, `?scope=accounts:a,b`) so views are linkable/bookmarkable and the back button works. Last-used scope is remembered per device (localStorage, wrapped in try/catch) only as a fallback when the URL has none.
- One server-side helper `resolveScope(searchParams) → account_id[]` used by **every** query (dashboard, calendar, trades, analytics, money). No screen may query trades without going through it.
- Every trade row, calendar trade preview, and chart tooltip shows **which account** it came from (login + phase badge, e.g. `7002880 · Funded`).
- When the scope mixes accounts of **different sizes or demo + real**, show a small notice and offer an **R view toggle** ($ ↔ R), because dollar sums across a demo 25K and a real 25K are not the same kind of money. R is the default unit when scope = mixed demo + funded.

### 8.2 Trading calendar (functional parity with FundedNext's calendar, own design)

Lives on the **Tracker Overview** (current month) and as a full page `/tracker/calendar`. Respects the global scope (§8.1).

Same **features** as FundedNext's trading calendar (month grid → click a day → full day breakdown), enriched with every piece of data this app holds. Own design. Data comes from this app's own database, not from FundedNext's calendar.

**Reference (FundedNext, mobile, account 7002880, Oct 2026):** a Mon–Fri grid (no weekend columns) with a `‹ October 2026 ›` month switcher. Each traded day is a filled tile: red background + red P/L for a losing day, green for a winning day, with the trade count under it (e.g. `$383.70 · 3 Trades`). Today is highlighted with a box around the date number. Non-traded days show only the date. It sits inside an account page whose header shows phase + size + firm, login, status badge ("Active"), platform, and cycle dates, with tabs Overview / Calendar / History. **Copy this structure and simplicity for the default cell**; everything extra goes into hover, day view, and summaries.

**Month view**
- **Mon–Fri columns by default.** Add Sat/Sun columns automatically only if the month contains a weekend trade.
- `‹ Month Year ›` switcher, month picker, "today" button; **today's date boxed/highlighted**.
- Mobile layout must fit 5 columns on a ~375px screen without horizontal scroll (FundedNext's does).
- **Day cell (default — same as FundedNext):**
  - Net P/L (or R, per $/R toggle), coloured green/red
  - Trade count (`3 Trades`)
  - Whole tile filled green/red; intensity scaled to the month's max absolute day P/L
- **Day cell extras (small icons in a corner, never more text):** 📰 news trade · 📝 journaled · ⚠️ rule-proximity warning · 🔄 account status changed that day. W/L split and win rate go in the hover preview, not the cell.
- Days with no trades are shown empty (not hidden).
- **Hover (desktop) / long-press (mobile) preview:** up to 3 trades (account, symbol, side, P/L, R) + "+N more".
- **Cell display toggle** (user picks what the main number is): net $ · R · trade count · win rate · % of starting balance.
- **Weekly summary column:** net P/L ($ and R), trades, win rate, green/red days.
- **Month summary panel:** net P/L ($ and R), trading days, green vs red days, best day, worst day, win rate, profit factor, expectancy R, avg trades/day, longest green and red day streaks, total commission + swap, % of days following plan (from journal), and status events this month (accounts passed / breached / started).
- When scope has multiple accounts: per-account mini breakdown in the cell (small stacked bar or dots coloured per account).

**Day view** (click a day → side panel on desktop, full screen on mobile)
- **Summary:** trades, wins/losses/scratches, win rate, net P/L ($, R, % of balance), gross profit, gross loss, profit factor, commission + swap, total lots, avg hold time, best and worst trade, symbols traded, sessions traded, accounts traded (with status badges).
- **Risk/rules (per account traded that day):** start-of-day balance, end-of-day balance, daily loss used vs daily-loss limit (% of limit), distance to max-loss limit — from `balance_snapshots` + `rule_snapshots`.
- **Every closed trade:** account (login + phase + status badge), symbol, side, lots, open/close time, hold time, entry/exit, SL/TP (final), P/L, P/L %, R, firm-reported RR, news flag, session, tags, followed-plan, journal status → click opens trade detail.
- **Intraday equity curve** for the day (per account and combined).
- **Status events** that day (e.g. "3027687 passed — Profit Target Reached").
- **Daily note:** create/edit inline (mood, market context, notes).

**Day boundary setting**
- A "day" uses a configurable **timezone + rollover hour** in Settings. **Default: Asia/Beirut, midnight (Joe's decision).** Option: NY 17:00 rollover.
- Compute day buckets in SQL (`closed_at` shifted by the configured offset), not in the browser.

**Acceptance:** month grid, hover preview, day drill-down, weekly + monthly summaries, $/R toggle, and scope filtering all work on real imported data, on both phone and desktop.

### 8.3 Screens

0. **Hub** (`/`, after login) — see §8.0.
1. **Tracker Overview** (formerly "Dashboard") — current-month **calendar (§8.2)**; combined equity curve; net prop result (payouts − fees); headline stats (trades, win rate vs breakeven win rate, expectancy R, profit factor, max DD); sync-health indicator. All scoped by §8.1.
2. **Accounts** — every account ever, grouped by journey (P1 → P2 → Funded), status badges, per-account mini equity curve. Filters: firm, phase, status, demo/real.
3. **Account detail** — **header card** (like FundedNext's): phase + size + firm, login, status badge (§5.1), platform, current/last cycle dates, net P/L. Below it, **tabs**: Overview (equity curve, stats, rule limits + proximity, lifecycle timeline) · Calendar (the §8.2 component with scope fixed to this account) · Trades · Journal. Same calendar component as the dashboard — one component, scope passed in.
4. **Demo vs Funded comparison** — same metrics side by side per phase (win rate, avg win R, avg loss R, trade count/day, avg hold time, session mix, lot sizes). Highlight biggest deltas.
5. **Trades** — all trades in the current scope (§8.1), with an **Account** column (login + phase badge, links to account detail). Filterable/sortable by account, symbol, side, session, weekday, tag, followed-plan, news, source live/backtest, date range; click → trade detail. CSV export of the filtered view.
6. **Trade detail + journal** — trade facts, journal form (setup tag, followed plan, planned RR/risk, emotions, mistakes, notes, screenshots). **Mobile-first layout**; fast to fill on phone.
7. **Analytics** — R distribution histogram, P/L by symbol / session / hour / weekday, streaks, hold-time vs outcome, news vs non-news.
8. **Live vs Backtest** — same metrics, live vs backtest, per symbol.
9. **Money** — fees, resets, payouts timeline; cumulative net.
10. **Daily notes** — calendar view with daily P/L heat map + notes.
11. **Imports & Health** — list of `raw_imports`, status, errors, "reprocess" button, manual upload (JSON in contract format, or CSV), test-alert button.
12. **Settings** — default risk %, scratch threshold, tags management, alert channels.

---

## 9. Backfill

- The **first** producer run uses `"mode": "full"`: all active, inactive, and breached accounts; all cycles per account (`get_account_cycles` + `get_cycle_trading_history`); payments and payouts.
- Known accounts at time of writing (verify in the data, don't hard-code):
  - `3027687` — Stellar 2-Step Demo P1, 25K — Profit Target Reached (passed)
  - `3028722` — Stellar 2-Step Demo P2, 25K — Profit Target Reached (passed)
  - `7002880` — Stellar 2-Step Real, 25K — active (funded)
- **Excel backtests:** Joe has US30 and NAS100 backtest journals (Dec 2025 – Apr 2026). Build a one-off importer: inspect the actual files first, map columns, import as `source = backtest` into synthetic accounts. Ask Joe for the files; do not guess column names.

---

## 10. Build phases & acceptance criteria

| Phase | Scope | Done when |
|---|---|---|
| **0. Pipeline proof** *(done by Joe in claude.ai, not Claude Code)* | Create the scheduled task from Appendix A; share Drive folders; run once manually. | A valid `full` export file sits in `inbox/` with no human involvement after setup. |
| **1. Foundation** | Repo, Supabase project, migrations (§5), auth (single email), Drive service account, `/api/cron/import`, zod contract (§4), `raw_imports`, manual upload page, reprocess script. | Backfill file imports cleanly; re-importing the same file changes nothing (idempotent). |
| **2. Sync health & alerts** | §7 fully: staleness checks (daily job + page load), all conditions, recovery message, banner, test button. | Deleting the inbox file / unsharing the folder / uploading a malformed file each show the correct banner on the next page load. |
| **3. Hub, scope, calendar & accounts** | App shell + hub + module layouts (§8.0), global scope selector (§8.1), calendar (§8.2), screens 0–5, metrics (§6), symbol point values, day-boundary setting. | Switching scope updates every screen; combined equity curve and demo-vs-funded comparison render from real data; numbers match FundedNext's own stats for the current cycle (win rate 35.29%, PF 0.5 at time of writing); calendar has full feature set (§8.2); every account shows its status badge and lifecycle timeline (§5.1). |
| **4. Journal** | Screens 5–6, 10, tags, screenshots, mobile polish. Optional Telegram alerts. | Journaling a trade on a phone takes < 60 s. |
| **5. Money & rules** | Screen 9, rule snapshots + proximity on account pages. | Net prop result shown; rule limits come from data. |
| **6. Backtests & analytics** | Excel importer, screens 7–8. | Live vs backtest R comparison per symbol. |

**Testing:** unit tests for parsing (`rr_ratio`, `lots`, timestamps, side), metric functions (§6), dedupe/upsert; fixture files in `tests/fixtures/` built from the sample trade above. One end-to-end test: fixture file → import → dashboard numbers.

---

## 11. Known limitations (state them in the UI where relevant)

- **Daily sync ≠ live protection.** Rule warnings describe yesterday; they cannot stop an intraday breach.
- **Single point of dependency:** the producer depends on the claude.ai scheduled task and the FundedNext connector. If either changes, data stops — which is why §7 exists. Stored data is never lost.
- **Data availability at the firm:** the importer captures what FundedNext still exposes; very old accounts may be gone already.
- **Initial stop loss is not in the data** → R uses planned/default risk (§6).
- Only FundedNext in v1. Other firms are added by writing a new producer that emits the same contract with a different `firm`.

---

## 12. Repo conventions

> Superseded by `tech-architecture.md` (monorepo layout, Biome, Drizzle, CI). Kept below for the money/timezone rules, which still apply.

- `pnpm`, ESLint + Prettier, strict TS, zod at every boundary.
- `src/lib/import/` (contract, parser, upsert), `src/lib/metrics/` (pure functions, unit-tested), `src/lib/alerts/`, `src/app/(app)/…` screens, `src/app/api/cron/…`.
- All money as `numeric(14,2)` in DB and decimal-safe in code.
- Timezones: store UTC; display Asia/Beirut; session logic in America/New_York.
- README with setup steps: Supabase project, Google service account + folder sharing, Vercel env vars, cron config.

---

## Appendix A — Producer (claude.ai scheduled task) prompt

Set this up in **claude.ai** (where the FundedNext connector lives), daily at 00:20 Asia/Beirut, with push + email notifications on. Not part of the Claude Code build.

```
Export my FundedNext trading data to Google Drive for my trading tracker app.

1. Using the FundedNext connector, list my accounts in all buckets (active, inactive, breached) on the forex/CFD tab.
2. For each account: get account overview, status history, applicable rules and risk parameters, parent account, all cycles, and ALL trades for every cycle (loop through every page — never stop at page 1).
3. Get my payment history and payout history.
3b. Get the economic news calendar (get_news_calendar_by_range, UTC) from 7 days ago to 14 days ahead; on a "full" run, the last 12 months in 92-day chunks. Put it in the "news" section (news-spec.md §1.2).
4. Build one JSON file that matches the contract in §4 of trading-tracker-spec.md exactly (schema_version 1). Use mode "full" if the Drive inbox folder has no previous export files, otherwise "incremental" (incremental still includes every account and the current cycle's full trade list).
5. Save it to the Google Drive folder "trading-tracker/inbox" as fundednext_<YYYY-MM-DD>_<HHmm>Z.json (UTC). Never overwrite an existing file.
6. If any step fails, still write the file with status "partial" or "error" and list each failure in errors[]. Always write a file, even with no new trades.
7. Do not place trades, change settings, or take any action on my FundedNext account. Read only.
```

FundedNext connector tools involved: `get_accounts_v2`, `get_account_overview`, `get_account_status_history`, `get_account_applicable_rules`, `get_risk_parameters`, `get_parent_account`, `get_account_cycles`, `get_trading_history`, `get_cycle_trading_history`, `get_payment_history`, `get_payout_history_v2`, `get_news_calendar_by_range`.
Google Drive connector tool: `create_file`.

## Appendix B — Open questions for Joe (builder should ask, not assume)

1. The backtest Excel files (for column mapping).
2. Domain name, if any (else `*.vercel.app`).

**Decided:** Drive folders = `trading-tracker/` with `inbox/` and `processed/`; IDs and env vars live in `docs/ops/sync.md` (single source of truth). Alerts = in-app banner only for v1 (email/Telegram later); timezone = Asia/Beirut for display and day boundaries; risk = per trade, from journal initial SL when entered, otherwise derived/estimated (§6).
