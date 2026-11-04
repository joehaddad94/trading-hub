import { ChartCandlestick, FlaskConical, type LucideIcon, Newspaper } from 'lucide-react';
import type { Route } from 'next';

export type ModuleId = 'tracker' | 'news' | 'backtest';

/** `badge`: a count shown next to the label (e.g. trades still to journal). `ownerOnly`: hidden from invited users. */
export type NavItem = { href: Route; label: string; badge?: number; ownerOnly?: boolean };

export type ModuleDef = {
  id: ModuleId;
  name: string;
  href: Route;
  /** Hub tile icon. */
  icon: LucideIcon;
  description: string;
  nav: NavItem[];
};

/**
 * The module registry (tracker spec §8.0): independent modules behind the hub, which is the only way from one
 * to another (Joe, 4 Nov 2026). The hub draws one tile per entry, in this order, and each module's layout takes
 * its header tabs from here.
 *
 * Adding a module: add its id to `ModuleId` and an entry here, give it a route group `app/(<id>)/<id>/` whose
 * layout renders `<AppShell title nav rootHref>` from `getModule('<id>')`, put its code in `src/modules/<id>/`
 * (no imports from other modules), and add its hub summary to `HUB_SUMMARIES` in `app/(hub)/page.tsx`
 * (TypeScript asks for it).
 */
export const MODULES: ModuleDef[] = [
  {
    id: 'tracker',
    name: 'Tracker',
    href: '/tracker',
    icon: ChartCandlestick,
    description: 'Accounts, trades, calendar and journal',
    nav: [
      { href: '/tracker', label: 'Overview' },
      { href: '/tracker/calendar', label: 'Calendar' },
      { href: '/tracker/trades', label: 'Trades' },
      { href: '/tracker/journal', label: 'Journal' },
      { href: '/tracker/accounts', label: 'Accounts' },
      { href: '/tracker/analytics', label: 'Analytics' },
      { href: '/tracker/money', label: 'Money' },
    ],
  },
  {
    id: 'news',
    name: 'News',
    href: '/news',
    icon: Newspaper,
    description: 'Week view of high-impact and restricted events',
    nav: [
      { href: '/news', label: 'Week' },
      { href: '/news/history', label: 'Event history' },
      { href: '/news/rules', label: 'Restriction rules' },
    ],
  },
  {
    id: 'backtest',
    name: 'Backtest Lab',
    href: '/backtest',
    icon: FlaskConical,
    description: 'Bar-by-bar replay of US30 and NAS100, and how live compares',
    nav: [
      { href: '/backtest', label: 'Runs' },
      { href: '/backtest/chart', label: 'Chart' },
      // Built on the owner's live trades, so invited users never see it (proxy rule in lib/auth/access.ts too).
      { href: '/backtest/live-vs-backtest', label: 'Live vs backtest', ownerOnly: true },
    ],
  },
];

export function getModule(id: ModuleId): ModuleDef {
  const mod = MODULES.find((m) => m.id === id);
  if (!mod) throw new Error(`Unknown module: ${id}`);
  return mod;
}
