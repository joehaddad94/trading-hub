# Design spec — Trading Hub redesign (agreed 11 Oct 2026)

Joe's answers to the redesign questionnaire (https://claude.ai/artifact/EPGhRPzj3yreWy6ePX5UHy), plus the calls agreed in the project thread. This file wins on visual questions; `tech-architecture.md` still wins on technical ones.

## Direction
- **Mood:** premium broker app. Polished, roomy, soft glow; numbers first.
- **Base:** "Fog" mid-tone. Not dark mode, not light mode. One theme only.
- **Surfaces:** frosted glass cards over a faint cyan glow. The glass is tinted slightly darker than the page so text keeps contrast.

## Tokens (`apps/web/src/app/globals.css`)
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
- **Desktop:** slim icon rail on the left (Hub, Tracker, Journal, News, Backtest; Settings at the bottom), labels as tooltips. Each module shows its own pages as tabs in the header.
- **Phone:** bottom tab bar (Hub, Tracker, Journal, News, More). Module pages are scrollable tabs under the header.
- **Hub:** hero with today's P&L (big), week P&L and win rate, loss room bar, small equity curve. Module tiles below (Tracker, Journal, News, Backtest). Recent trades last.

## Charts
- Gradient area under lines (accent colour), faint grid, emphasised end point. Bars use profit/loss.
- Axes and tooltips keep the PR #8 behaviour (date axes, readable tooltips).
- **Backtest chart:** keep KLineCharts and our replay/trading/drawing code, restyled after TradingView's UX: drawing tools in a left toolbar, top toolbar with symbol, timeframe, indicators and replay; TradingView candle colours (`#089981` up, `#f23645` down) on a dark chart pane, crosshair with price/time labels, keyboard shortcuts. Not the TradingView library.

## Motion (lively)
- Cards rise in with a short stagger, hero numbers count up, a soft glow on green days.
- Tables, filters and form inputs are instant.
- Everything turns off under `prefers-reduced-motion`.

## Icons and states
- Outline icons (lucide-react, already a dependency) on nav, card titles and buttons.
- Loading: skeletons shaped like the content (`loading.tsx` per route). Empty states: one helpful line and an action.

## Kept behaviour
All PR #8 behaviour stays: chart date axes and tooltips, phone filter sheet, in-place day view, Quick journal queue, hub max-loss room.
