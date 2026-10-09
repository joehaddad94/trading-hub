# News Module — Build Spec

> Economic calendar ("red folders") inside the Trading Tracker app, so Joe doesn't need to open ForexFactory.
> **Audience:** Claude Code. Read `trading-tracker-spec.md` first (shared stack, DB, auth, import pipeline, banner alerts) and `backtester-spec.md` (chart markers).
> **Build order:** after Tracker phase 1 (needs the import pipeline). Small module — can run in parallel with Tracker phases 2–3.

---

## 0. TL;DR for the builder

- **Data source: FundedNext's economic calendar**, delivered through the **same daily Drive export** as trades (new `news` section in the contract). The app still never calls FundedNext or ForexFactory directly.
- Why FundedNext and not ForexFactory: ForexFactory has no official API and scraping it is against its terms; FundedNext's calendar carries the same kind of data **plus a `restriction` flag** — the one that actually matters for Joe's prop rules.
- Screens: a ForexFactory-style **News** page, a **News card on the hub** (today's red folders + countdown; tracker spec §8.0), and news markers across the tracker calendar, trade detail, analytics, and the backtester chart.

---

## 1. Data

### 1.1 Observed FundedNext event shape (`get_news_calendar_by_range`)

```json
{
  "id": 1893779,
  "title": "FOMC Meeting Minutes",
  "country": "USD",
  "date": "7th Oct, 09:00 PM",
  "day": "Wednesday",
  "timestamp": 1791396000,
  "impact": "High",
  "forecast": "",
  "previous": "",
  "is_restricted": 1,
  "restriction": "Restrictions"
}
```

- `impact` values seen: `High`, `Medium`, `Low`, `Holiday`. Map to folder colours: **High = red**, Medium = orange, Low = yellow, Holiday = grey.
- `country` is a **currency code** (USD, EUR, GBP, JPY, CAD, …).
- `timestamp` = unix seconds (UTC) → the source of truth. `date`/`day` are display strings — ignore.
- `forecast` / `previous` are strings (may be empty, may contain `|` for auctions) → store as text.
- **No `actual` value is provided.** See §6.
- Max query span is **92 days**.
- **Duplicates exist:** the same event can appear twice with different `id`s and slightly different times (likely reschedules, e.g. two "MPC Member Pill Speaks" on 8 Oct). Handle per §1.3.

### 1.2 Export contract addition (tracker spec §4)

Add to the daily export file:

```jsonc
"news": {
  "range": { "start": "2026-10-03", "end": "2026-10-24" },
  "timezone": "Etc/UTC",
  "events": [ /* raw get_news_calendar_by_range rows */ ]
}
```

- **Daily run:** from 7 days back to 14 days ahead (catches reschedules and gives two weeks of lookahead).
- **First (`full`) run:** backfill the **last 12 months** in 92-day chunks (needed for analytics and backtester markers).
- Producer queries in **UTC** (`timezone` omitted or `Etc/UTC`); the app converts to Beirut.

### 1.3 Table `economic_events`

| Column | Notes |
|---|---|
| `id` uuid pk | |
| `source` | `fundednext` |
| `external_id` int | unique per source |
| `title`, `currency`, `impact` enum(`high`,`medium`,`low`,`holiday`) | |
| `event_at` timestamptz | from `timestamp` |
| `forecast`, `previous`, `actual` text | `actual` null for now (§6) |
| `is_restricted` bool, `restriction_label` text | |
| `first_seen_at`, `last_seen_at` timestamptz | |
| `superseded_by` uuid null | set when a newer duplicate replaces it |
| `raw` jsonb | |

**Dedupe/reschedule rule:** within a currency, if two events share the same `title` and are within 3 hours of each other, the one present in the **latest** export wins; the other gets `superseded_by` and is hidden. Events in the synced range that disappear from the latest export are also hidden (cancelled), not deleted.

---

## 2. News page (`/news`) — ForexFactory-style

- **Week view** grouped by day (Mon–Fri, plus weekend days only if they have events), `‹ week ›` navigation, "This week" / "Next week" / "Today" buttons, date picker.
- **Row columns:** time (Asia/Beirut, "All day" for holidays) · currency · impact folder icon · event title · forecast · previous · restriction badge (🔒 when `is_restricted`).
- Today highlighted; the **next upcoming event** row highlighted with a live **countdown**; past events dimmed.
- Same-time events grouped visually (e.g. CAD Employment Change + Unemployment Rate at 15:30).
- **Filters** (persisted, URL-driven like the tracker scope):
  - Impact — default **High only** (red folders), with chips for Medium/Low/Holiday
  - Currency — default **USD** (Joe trades US30 and NAS100), multi-select for others
  - Restricted only (toggle)
- Mobile-first: on phones, collapse forecast/previous into a second line under the title.
- Click an event → small panel: details, other occurrences of the same event (history of forecast/previous), and Joe's trades within ±60 min of past occurrences (with P/L).

---

## 3. Hub card (tracker spec §8.0)

The News module is its own workspace with its own navigation (Week view, Event history, Restriction rules). Its summary appears on the hub:


- **"Today"** card: today's red-folder (and restricted) events for the selected currencies, times in Beirut, countdown to the next one, and a ⚠️ line during an active restriction window (§5).
- **"This week"** strip: count of red folders per day (Mon–Fri) so heavy days stand out.
- Empty state: "No high-impact USD news today."

---

## 4. Integration with the other modules

**Tracker calendar (tracker spec §8.2)**
- Day cell: 📰 icon when a red-folder event for the selected currencies falls on that day (in addition to the existing per-trade `is_news` flag).
- Day view: list that day's events (time, currency, folder, title, restricted) above the trades.

**Trade detail**
- "News around this trade": events within ±60 min of open/close, with minutes before/after.
- Badge if the trade was opened or closed **inside a restriction window**.

**Analytics**
- Performance split: trades on red-folder days vs other days; trades within ±30 min of a red folder vs not; per-event-type stats (e.g. FOMC, CPI, NFP days).

**Backtester (backtester spec)**
- Vertical event markers on the chart (folder colour), toggle by impact and currency; hover shows title, forecast, previous.
- In replay, scheduled events **ahead** of the cursor may be shown (the schedule is known in advance — not lookahead). If `actual` is ever added (§6), it must stay hidden until the cursor passes the event time.

---

## 5. Restriction windows

- `is_restricted` marks events where FundedNext's news rules apply. The **window length** (minutes before/after) and **which instruments** it covers are FundedNext rules — **do not hard-code them**. Store them as settings (`news_restriction_minutes_before`, `..._after`, applicable currencies) with defaults Joe confirms (see §8).
- Joe's funded account (7002880) has the **News Trading Allowed** add-on (`ANT`), so restriction windows may not apply to it — the restriction setting must be **per account**, defaulting to off for accounts with `ANT = 1`.
- Restricted events of other currencies (e.g. CAD, GBP, JPY high-impact were restricted in Oct 2026 data) are shown, but whether they affect US30/NAS100 depends on the firm's rules → setting.

---

## 6. Scope decision: folders only, no live news (Joe's decision)

v1 is about the **schedule and impact folders**, updated by the daily sync. **Out of scope for now — do not build:**
- Live / intraday news updates (same-day additions or reschedules appear after the next daily sync).
- Actual release values (FundedNext's calendar doesn't provide them).
- Any second news source or polling job.

Keep the `actual` column nullable and the `NewsProvider` interface so these can be added later without schema changes. Show "Calendar last synced: <time>" on the News page so stale data is never mistaken for current.

---

## 7. Build phases

| Phase | Scope | Done when |
|---|---|---|
| **N1. Data** | Contract addition, `economic_events`, dedupe/reschedule logic, 12-month backfill | A year of events in the DB; duplicates hidden; re-import is idempotent. |
| **N2. News page + widget** | §2, §3 | Joe can check the week's USD red folders on his phone faster than on ForexFactory. |
| **N3. Tracker integration** | Calendar icons, day view list, trade detail, restriction-window badges, analytics split | News-day vs non-news-day stats render from real data. |
| **N4. Backtester markers** | §4 backtester part | Event markers show on the replay chart with no lookahead on actuals. |

---

## 8. Open questions for Joe

1. FundedNext's restriction window (minutes before/after) and whether non-USD restricted events apply to US30/NAS100 — can be checked in FundedNext's rules before N3.
2. Default currencies besides USD? (e.g. none, or EUR/GBP too)

**Decided:** no live news and no actual values in v1 (§6).
