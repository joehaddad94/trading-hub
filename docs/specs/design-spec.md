# Design spec — Trading Hub redesign (agreed 11 Oct 2026)

Joe's answers to the redesign questionnaire (https://claude.ai/artifact/EPGhRPzj3yreWy6ePX5UHy), plus the calls agreed in the project thread. This file wins on visual questions; `tech-architecture.md` still wins on technical ones.

## Direction
- **Mood:** premium broker app. Polished, roomy, soft glow; numbers first.
- **Themes (Joe, 4 Nov 2026):** light and dark. "Fog" (the mid-tone below) is the **dark** theme; the light theme is a cool off-white (`#f1f4f8`) with white glass. Default follows the device setting; the user can pin Light or Dark (Settings > Appearance, the sun/moon button in every module bar and on the hub, Light/Dark/System in the account menu). Saved per device in localStorage, applied by an inline script before first paint (`apps/web/src/lib/theme.ts`), so there is no flash and no DB column.
- **Base (dark):** "Fog" mid-tone.
- **Surfaces:** frosted glass cards over a faint cyan glow. The glass is tinted slightly darker than the page so text keeps contrast.

## Tokens (`apps/web/src/app/globals.css`)
Components use only these semantic tokens (Tailwind `bg-card`, `text-profit`, …), never raw hex or `white/`/`black/` classes, so both themes work. `:root` holds the light values, `.dark` the Fog values below. Extra tokens: `destructive-foreground`, `warning-foreground`, `field` (input fill), `bar` (phone tab bar), `glass-edge`/`glass-shadow`, `glow-1`/`glow-2` (page glow), `chart-1..6` (account colours).
Light values: background `#f1f4f8`, card white/66%, foreground `#0f172a`, muted text `#525c6b`, accent `#0a7385`, profit `#077a4f`, loss `#c82a49`, warning `#9a5b00` (all at least 4.5:1 on the page).

Dark (Fog) values:
| Token | Value | Use |
|---|---|---|
| background | `#3b4250` + cyan/violet radial glow | page |
| card | `rgb(22 27 36 / 0.30)` + `backdrop-blur` + `white/10` border | glass cards |
| popover | `#363d4a` (opaque) | menus, sheets, tooltips |
| foreground | `#f6f8fb` | text |
| muted-foreground | `#c3cad6` | secondary text |
| primary (accent) | cyan `#4fd1e0`, text on it `#062a2f` | buttons, active nav, links, equity line |
| profit | mint `#3ecf8e` | gains, wins |
| loss | rose `#ff8da1` (lightened from `#fb7185` for AA contrast on Fog) | losses |
| warning | amber `#f5c26b` | needs attention, badges, restrictions |
| radius | 10px | soft corners |

Profit and loss colours never carry meaning alone where it matters: signs (+/−) stay on every number.
Account colours (multi-account charts): cyan, amber, violet, pink, lime, orange — never mint or rose.

## Typography
- Geist for UI, Geist Mono for every number (`num` utility = Geist Mono + tabular figures).
- Balanced density: table rows ~40px, 44px minimum touch targets on phone.

## Layout and navigation
- **Hub only (Joe, 4 Nov 2026; replaces the icon rail and phone bottom bar):** modules are reached from the hub. A module header has a Hub button, the module name, and its own pages as tabs (scrollable on phone). Theme, Settings and Log out sit top-right on the hub; an invited user's Backtest Lab header has theme and Log out.
- **Module bar (navbar redesign A, Joe 8 Nov 2026):** a frosted glass bar floating 6–8px off the screen edges (rounded-xl, glass shadow). Left: Hub house button, divider, module chip (registry icon in a cyan tile + name). Middle: the module's pages as a pill segmented control (active pill = popover surface + ring); on a phone the pills get their own row, scroll sideways, fade at the edge that has more and start on the current page. Right: module controls (Tracker scope; replaces the name on a phone), status chips (sync, market data; the list opens under the chip, never full-width strips), theme button, account menu (email, Light/Dark/System, Settings for the owner, Log out). Backtest Lab on a phone stays one row (no name, theme inside the account menu) to keep chart height. Audit: https://claude.ai/artifact/S2UKznpLtRWcmmokYTaf2y
- **Hub:** hero with today's P&L (big), week P&L and win rate, loss room bar, small equity curve. One tile per registered module (Tracker with its "to journal" count, News, Backtest Lab). Recent trades last.

## Charts
- Gradient area under lines (accent colour), faint grid, emphasised end point. Bars use profit/loss.
- Axes and tooltips keep the PR #8 behaviour (date axes, readable tooltips).
- **Backtest chart:** keep KLineCharts and our replay/trading/drawing code, restyled after TradingView's UX: drawing tools in a left toolbar, top toolbar with symbol, timeframe, indicators and replay; TradingView candle colours (`#089981` up, `#f23645` down) on TradingView's dark pane in the dark theme and its white pane in the light theme (`chart-theme.ts`), crosshair with price/time labels, keyboard shortcuts. Not the TradingView library.

## Motion (lively)
- Cards rise in with a short stagger, hero numbers count up, a soft glow on green days.
- Tables, filters and form inputs are instant.
- Everything turns off under `prefers-reduced-motion`.

## Icons and states
- Outline icons (lucide-react, already a dependency) on nav, card titles and buttons.
- Loading: skeletons shaped like the content (`loading.tsx` per route). Empty states: one helpful line and an action.

## Kept behaviour
All PR #8 behaviour stays: chart date axes and tooltips, phone filter sheet, in-place day view, Quick journal queue, hub max-loss room.
