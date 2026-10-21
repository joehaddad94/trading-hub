import type { Route } from 'next';

export type ModuleId = 'tracker' | 'news' | 'backtest';

/** `badge`: a count shown next to the label (e.g. trades still to journal). */
export type NavItem = { href: Route; label: string; badge?: number };

export type ModuleDef = {
  id: ModuleId;
  name: string;
  href: Route;
  description: string;
  nav: NavItem[];
};

/** Tracker spec §8.0 — three separate modules behind the hub. */
export const MODULES: ModuleDef[] = [
  {
    id: 'tracker',
    name: 'Tracker',
    href: '/tracker',
    description: 'Accounts, trades, calendar and journal',
    nav: [
      { href: '/tracker', label: 'Overview' },
      { href: '/tracker/calendar', label: 'Calendar' },
      { href: '/tracker/trades', label: 'Trades' },
      { href: '/tracker/journal', label: 'Journal' },
      { href: '/tracker/accounts', label: 'Accounts' },
      { href: '/tracker/analytics', label: 'Analytics' },
      { href: '/tracker/live-vs-backtest', label: 'Live vs backtest' },
      { href: '/tracker/money', label: 'Money' },
    ],
  },
  {
    id: 'news',
    name: 'News',
    href: '/news',
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
    description: 'Bar-by-bar replay of US30 and NAS100',
    nav: [
      { href: '/backtest', label: 'Runs' },
      { href: '/backtest/chart', label: 'Chart' },
    ],
  },
];

export function getModule(id: ModuleId): ModuleDef {
  const mod = MODULES.find((m) => m.id === id);
  if (!mod) throw new Error(`Unknown module: ${id}`);
  return mod;
}
