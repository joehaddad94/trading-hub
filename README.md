# Trading App

Personal web app that keeps a permanent record of every prop-firm account and trade, survives account breaches and resets, and adds a journal, a replay backtester and a news calendar.

Single user (Joe). Responsive: phone and desktop.

## Modules

After login a **hub** links to three separate modules:

| Module | What it does | Spec |
|---|---|---|
| **Tracker** (incl. Journal) | Every FundedNext account and trade, kept forever; trading calendar, stats, account statuses, money in/out, rule limits, journal | [`docs/specs/trading-tracker-spec.md`](docs/specs/trading-tracker-spec.md) |
| **News** | Week view of impact folders and restricted events (replaces checking ForexFactory) | [`docs/specs/news-spec.md`](docs/specs/news-spec.md) |
| **Backtest Lab** | Bar-by-bar replay of US30 / NAS100 on 1m / 5m / 15m with drawing tools, ATR, RSI and simulated trades | [`docs/specs/backtester-spec.md`](docs/specs/backtester-spec.md) |

How it is built: [`docs/specs/tech-architecture.md`](docs/specs/tech-architecture.md). Rules for Claude Code: [`CLAUDE.md`](CLAUDE.md).

## How data gets in

The app never connects to FundedNext, cTrader or any trading platform.

```
claude.ai scheduled task (Tue–Sat 00:20 Beirut, FundedNext connector)
        │  JSON export (schema v1)
        ▼
Google Drive  trading-tracker/inbox
        │  daily Vercel cron + import-on-open
        ▼
Supabase Postgres  ← the app reads only from here
```

Operational details (folder IDs, schedule, checks): [`docs/ops/sync.md`](docs/ops/sync.md).

## Stack

Next.js (App Router) · TypeScript · pnpm + Turborepo · Supabase (Postgres, Auth, Storage) · Drizzle · Tailwind + shadcn/ui · Recharts · KLineCharts · Vitest · Playwright · Biome · Sentry · Vercel (Hobby).

## Status

| Phase | State |
|---|---|
| 0 · Sync pipeline (FundedNext → Drive) | ✅ Live — first export 9 Oct 2026, 99 trades, checksums matched |
| 1 · Scaffold + foundation | Not started |
| 2 · Sync health | Not started |
| 3 · Hub, scope, calendar, accounts | Not started |
| News N1–N4 | Not started |
| Backtester B1–B7 | Not started |

## Getting started (once scaffolded)

```bash
pnpm install
supabase start          # local Postgres (Docker)
cp .env.example apps/web/.env.local   # fill in values
pnpm dev
```

Commands are listed in `CLAUDE.md`.
