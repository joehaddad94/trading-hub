# Backtester Module — Build Spec

> A simple, TradingView-style **replay backtester** for US30 and NAS100, built as a module inside the Trading Tracker app.
> **Audience:** Claude Code. Read `trading-tracker-spec.md` first — this module shares its stack, auth, database, trade tables, journal, metrics, and alerting.
> **Build order:** start only after Tracker phases 0–3 are done.

---

## 0. TL;DR for the builder

- Historical **1-minute candles** for US30 and NAS100, about **1 year back**, updated **daily with yesterday's data**. No live data.
- Chart with **1m / 5m / 15m** timeframes (5m and 15m built from 1m).
- **Bar-by-bar replay** with no lookahead.
- Drawing tools v1: **horizontal line, trend line, long position, short position (risk/reward), measure tool.**
- Indicators v1: **ATR and RSI** only.
- Placing a long/short position tool during replay creates a **simulated trade**; finished trades are saved as `source = 'backtest'` in the tracker's `trades` table, so they appear in the calendar, stats, journal, and live-vs-backtest comparison automatically.
- Everything else (more timeframes, Fibonacci, more indicators) is out of scope for v1 — but the design must make adding them easy.

---

## 1. Market data

### 1.1 Source
- **Dukascopy historical data** (free). Index CFD instruments roughly `USA30IDXUSD` (US30) and `USATECHIDXUSD` (NAS100) — verify exact instrument codes before building.
- Use an existing library (e.g. `dukascopy-node`) rather than parsing raw `.bi5` files, if it works reliably; otherwise implement the download/decompress yourself.
- Use **bid** prices for candles (store ask too if cheap, for spread modelling later).
- Timestamps in **UTC**.
- Prices will not match FundedNext's feed exactly. Show a one-line note in the backtester UI: "Historical data from Dukascopy; prices may differ slightly from your broker."
- Abstract the source behind a `MarketDataProvider` interface so it can be swapped later (e.g. futures data).

### 1.2 Storage (Supabase Postgres)

| Table | Columns | Notes |
|---|---|---|
| `instruments` | `code` (e.g. `US30`), `provider_code`, `display_name`, `point_value_per_lot`, `price_digits`, `default_spread_points` | Seed US30, NAS100. `point_value_per_lot` ≈ 10 USD for both on Joe's FundedNext account — verify against `symbol_specs` in the tracker. |
| `candles_1m` | `instrument_id`, `ts` (timestamptz, minute open), `open`, `high`, `low`, `close`, `volume` | **PK `(instrument_id, ts)`**. ~350k rows per instrument per year — no partitioning needed. |
| `data_ingest_runs` | `instrument_id`, `from_ts`, `to_ts`, `rows_inserted`, `status`, `error`, `ran_at` | Ingest log. |

- 5m and 15m candles are **derived from 1m**, either on the fly in SQL (`date_bin`) or in the client. Do **not** store them separately in v1.
- Index-aligned buckets: 5m/15m buckets aligned to the UTC hour (`:00, :05, …`, `:00, :15, …`).

### 1.3 Ingestion
- **Backfill script** (`scripts/backfill-candles.ts`, run locally once): last 12 months for both instruments. Idempotent (upsert on PK), resumable, logs progress.
- **Daily Vercel Cron** (`/api/cron/candles`, ~02:00 UTC): fetch the previous UTC day for each instrument, upsert, log a run.
- **Gap check** after each run: flag missing minutes during normal trading hours (excluding weekends and known market holidays/closures). Weekend and holiday gaps are expected — don't alert on those.
- **Alerts:** reuse the tracker's alerting (§7 of the tracker spec). Alert if the daily candle job fails, inserts 0 rows on a weekday, or finds unexpected gaps.

---

## 2. Chart

### 2.1 Library
- **KLineCharts** (open source) — has built-in overlay/drawing support and custom overlays/indicators. Verify licence and current API before starting.
- If KLineCharts proves unsuitable, TradingView **Lightweight Charts** is the fallback, but then the drawing layer must be built by hand (much more work) — ask Joe before switching.

### 2.2 Behaviour
- Instruments: US30, NAS100 (dropdown).
- Timeframes: **1m, 5m, 15m** (buttons + keyboard `1`, `5`, `F`).
- Switching timeframe keeps: the replay cursor, all drawings, the visible time range (as close as possible), and open simulated trades.
- Crosshair with OHLC + time readout. **Times shown in Asia/Beirut (Joe's decision)**; setting available for New York time.
- **Session shading** (optional toggle): Asia, London, NY AM, NY PM kill zones, defined once in the tracker spec §6 (ET) — do not redefine here.
- Lazy loading: fetch candles in windows (e.g. 3 trading days around the view) as the user scrolls back; never load the full year into the browser.
- **Module placement:** Backtest Lab is a separate module reached from the hub (tracker spec §8.0), with its own full-screen layout and no app sidebar.
- Mobile: chart must be usable on a phone (pinch zoom, pan, tap to select drawings), but **desktop is the primary target** for backtesting.

---

## 3. Replay (the core feature)

### 3.1 Controls
- **Start point:** pick a date + time, or click a candle with a "Start replay here" tool.
- **Step forward** one bar of the current timeframe (`→` key) and **step forward one minute** (`Shift + →`).
- **Play / pause** (`Space`) with speeds: 1, 2, 5, 10, 20 bars/second (configurable).
- **Jump to next session open** (Asia / London / NY AM / NY PM) and **jump to next day**.
- **Exit replay** returns to the latest data.
- No step backward in v1 (avoids peeking). Restarting at an earlier point is allowed.

### 3.2 No lookahead — non-negotiable
- The replay cursor is stored at **1-minute resolution**.
- On 5m/15m, the current (forming) candle is built **only from 1m bars up to the cursor**, and it updates minute by minute as replay advances — exactly like a live chart. Never show the completed higher-timeframe candle before its last minute has been replayed.
- Indicators (ATR, RSI) are computed **only from candles up to the cursor**, including the partial forming candle.
- The API endpoint that serves candles during replay must accept `until` and never return data after it.

---

## 4. Drawing tools (v1)

All drawings are anchored in **(time, price)** coordinates, never pixels, so they survive timeframe switches and zoom.

| Tool | Behaviour |
|---|---|
| **Horizontal line** | Click to place at a price. Drag to move. Price label on the axis. Optional text label. |
| **Trend line** | Two anchor points. Options: extend right, extend left, both. Drag anchors or whole line. |
| **Long position** (risk/reward, buy) | TradingView-style box: entry, stop-loss (below), take-profit (above). Drag each level. Shows: RR ratio, points to SL and TP, $ risk and $ reward from lot size (or lot size computed from risk % / $ risk — user chooses), % of account. Default RR on creation = 1:2 (configurable). |
| **Short position** (risk/reward, sell) | Same as long, mirrored (SL above, TP below). |
| **Measure** | Click-drag between two points. Shows: price change (points and %), number of bars, time span. Temporary by default (disappears on next click); hold `Shift` to keep it. |

**Common to all tools**
- Toolbar (left side on desktop, bottom sheet on mobile) + keyboard shortcuts (`Alt+H` horizontal, `Alt+T` trend, `Alt+L` long, `Alt+S` short, `Alt+M` measure — avoid clashes with browser shortcuts; adjust if needed).
- Select, move, delete (`Delete` key), colour, line width, lock, hide/show all, delete all.
- Drawings **persist** per instrument (and optionally per backtest session) in the DB — table `drawings`: `id`, `instrument_id`, `session_id` (nullable), `tool`, `points` jsonb (`[{ts, price}]`), `style` jsonb, `label`, `created_at`, `updated_at`.
- Architecture: each tool is a self-contained module registered in a tool registry, so new tools (Fibonacci, rectangle, ray, text) can be added later without touching existing ones.

---

## 5. Indicators (v1)

| Indicator | Default | Display |
|---|---|---|
| **ATR** | length 14, Wilder's smoothing (RMA) | Separate pane below the price chart. Value readout at crosshair. |
| **RSI** | length 14, source close, Wilder's smoothing | Separate pane, 0–100 scale, guide lines at 70 / 30 (configurable). |

- Settings dialog per indicator (length, colour; RSI levels).
- Toggle on/off; settings persisted per user.
- Implement as pure functions in `src/lib/indicators/` with unit tests against known reference values (e.g. compare a sample with TradingView's output for the same candles) — results must match TradingView's ATR/RSI formulas.
- Use KLineCharts' built-in versions only if they match those formulas; otherwise register custom indicators.
- Indicator registry so more can be added later.

---

## 6. Simulated trading

### 6.1 Placing a trade
- Drawing a **long/short position tool** during replay shows a **"Place trade"** button on the tool. Clicking it converts the drawing into a simulated order. (A position tool drawn without placing stays a pure drawing — useful for planning.)
- Order types v1:
  - **Market:** fills at the **open of the next 1m bar** after the cursor, plus spread (for buys) — entry level on the tool snaps to the fill price, SL/TP keep their distances.
  - **Limit / stop:** fills when price reaches the entry level, using 1m bars.
- While open: drag SL/TP to modify (e.g. move to breakeven); every modification is logged with the replay time. Manual **Close at market** button.

### 6.2 Fill and exit rules (deterministic, conservative)
- All fills and exits are evaluated on **1m bars**, regardless of chart timeframe.
- If a 1m bar touches **both SL and TP**, assume **SL hit first** (conservative). Count these cases and show the count in session stats ("ambiguous bars").
- Gaps: if a bar opens beyond SL/TP, fill at the **open** (slippage), not at the level.
- Costs (settings, per instrument): spread in points, commission per lot, slippage in points — defaults chosen to approximate FundedNext; Joe can change them.

### 6.3 What gets recorded
- On close, write a row to the tracker's `trades` table with `source = 'backtest'`, linked to the backtest session's account (§7), with: instrument, side, lots, entry/exit price and time (replay time), **initial SL and initial TP** (store these — unlike live data, the backtester knows them), final SL/TP, P/L after costs, exit reason (`tp`, `sl`, `manual`, `breakeven`), and the SL modification log.
- **R for backtest trades** = net P/L ÷ risk at the **initial SL**. This is exact, unlike live trades.
- Attach a **chart snapshot** at entry and at exit to the trade (stored in Supabase Storage, same as journal screenshots).
- The trade is immediately available in the tracker's journal (setup tag, followed plan, notes).

### 6.4 Deleting a backtest trade (Joe's requirement)
- Every backtest trade has a **Delete** action — in the session's trade list, on the trade detail page, and from the chart (right-click / long-press on the trade's marker).
- Confirmation dialog shows the trade (instrument, side, time, P/L) and says it will be removed from all stats and from the live-vs-backtest comparison.
- Delete removes the `trades` row and everything attached to it (journal entry, tags, screenshots, chart snapshots, SL modification log) in one transaction.
- All derived numbers update immediately: session stats and equity curve, the tracker calendar/analytics under the Backtest scope, and the **Live vs Backtest** screen.
- **Undo** toast for ~10 seconds after deleting.
- This applies **only to backtest trades** (`source = 'backtest'`). Live trades imported from FundedNext can never be deleted (tracker spec rule) — the server must refuse a delete on a live trade.
- Deleting a whole session works the same way (confirm → removes the session, its synthetic account, and all its trades).

---

## 7. Backtest sessions

- A **session** = one backtesting run: name, instrument(s), date range, strategy/setup tag, starting balance (default 25,000), risk per trade, cost settings, notes.
- Each session creates a synthetic tracker account (`phase = 'other'`, `is_demo = true`, label "Backtest – <session name>") so all tracker features (scope selector, calendar, stats) work unchanged. The scope selector's **Backtest** option covers these.
- Session screen: equity curve, stats (same metrics as the tracker §6), list of trades, ambiguous-bar count, resume replay where it stopped (store the cursor).
- Table `backtest_sessions`: `id`, `account_id`, `name`, `instrument_ids`, `start_ts`, `end_ts`, `cursor_ts`, `starting_balance`, `risk_pct`, `costs` jsonb, `setup_tag_id`, `notes`, `status` (`in_progress`, `completed`).

---

## 8. Excel backtest import — dropped

Dropped (Joe, 9 Oct 2026): there are no existing Excel backtest journals to import. Don't build an importer.

---

## 9. Build phases

| Phase | Scope | Done when |
|---|---|---|
| **B1. Data** | `instruments`, `candles_1m`, backfill script, daily cron, gap check, alerts | 12 months of 1m candles for both instruments in the DB; yesterday's data appears automatically each day; a failed run sends an alert. |
| **B2. Chart** | KLineCharts, instrument switch, 1m/5m/15m, lazy loading, crosshair, session shading | Smooth scrolling back through the full year on desktop; 5m/15m candles match an aggregation of the 1m data. |
| **B3. Replay** | Cursor, controls, partial forming candles, no-lookahead API | On 15m, the forming candle updates minute by minute; no request ever returns data after the cursor (add a test). |
| **B4. Drawings** | Horizontal, trend, long, short, measure; persistence; tool registry | Drawings survive reload and timeframe switches at the same time/price. |
| **B5. Indicators** | ATR, RSI with settings; unit tests vs reference values | Values match TradingView's for a sample window. |
| **B6. Simulated trading** | Place trade from position tool, fills, SL/TP rules, costs, recording into `trades`, snapshots | A full session of trades shows up in the tracker calendar, stats, and journal under the Backtest scope. |
| **B7. Sessions & comparison** | Session management, resume, live vs backtest screen | Joe can resume a session; live vs backtest metrics compare per instrument. |

---

## 10. Out of scope for v1 (design for, don't build)

More timeframes (30m, 1h, 4h, D), Fibonacci, rectangles, rays, text notes, more indicators (EMA, VWAP, …), multi-chart layouts, step-backward replay, tick-level data, automated (coded) strategy backtests, other instruments.

---

## 11. Open questions for Joe

None right now.

**Decided:** session shading = the tracker §6 kill zones (Joe, 9 Oct 2026). Data source = Dukascopy for US30/NAS100 (Joe, 9 Oct 2026); exact instrument codes still to verify before B1 (§1). Default backtest costs = match FundedNext per instrument (spread, commission per lot, slippage) (Joe, 9 Oct 2026); values to be sourced from FundedNext before B6 (§6). Chart times in Asia/Beirut. Risk in backtests is exact (initial SL is known), set per trade on the position tool — no default risk % needed beyond the tool's initial value.
