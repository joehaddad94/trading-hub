'use client';

import {
  ChartCandlestick,
  Ellipsis,
  FlaskConical,
  LayoutDashboard,
  type LucideIcon,
  Newspaper,
  NotebookPen,
  Settings,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type AppLink = { id: string; href: Route; label: string; icon: LucideIcon };

const HUB: AppLink = { id: 'hub', href: '/', label: 'Hub', icon: LayoutDashboard };
const TRACKER: AppLink = { id: 'tracker', href: '/tracker', label: 'Tracker', icon: ChartCandlestick };
const JOURNAL: AppLink = { id: 'journal', href: '/tracker/journal', label: 'Journal', icon: NotebookPen };
const NEWS: AppLink = { id: 'news', href: '/news', label: 'News', icon: Newspaper };
const BACKTEST: AppLink = { id: 'backtest', href: '/backtest', label: 'Backtest', icon: FlaskConical };
const SETTINGS: AppLink = { id: 'settings', href: '/settings', label: 'Settings', icon: Settings };

/** Which app-level destination the current path belongs to (Journal lives inside Tracker but has its own icon). */
function activeId(pathname: string): string {
  if (pathname === '/') return 'hub';
  if (pathname.startsWith('/tracker/journal')) return 'journal';
  for (const id of ['tracker', 'news', 'backtest', 'settings']) if (pathname.startsWith(`/${id}`)) return id;
  return '';
}

function Badge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return (
    <span
      className={cn(
        'num absolute rounded-full bg-warning px-1 font-semibold text-[10px] text-[#2a1c00] leading-4',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Desktop: slim icon rail; labels show as tooltips on hover and focus. The rail is its own stacking context
 * (sticky + backdrop blur), so it needs z-40 to keep those labels above the glass cards and sticky header.
 * An invited user (`guest`) only has the Backtest Lab.
 */
export function AppRail({ journalBadge = 0, guest = false }: { journalBadge?: number; guest?: boolean }) {
  const active = activeId(usePathname());
  const item = (link: AppLink) => {
    const Icon = link.icon;
    const on = active === link.id;
    return (
      <Link
        key={link.id}
        href={link.href}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'group relative flex size-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
          on && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
        )}
      >
        <Icon className="size-5" aria-hidden strokeWidth={1.8} />
        <span className="sr-only">{link.label}</span>
        <span
          aria-hidden
          className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-md bg-popover px-2 py-1 text-foreground text-xs opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {link.label}
        </span>
        {link.id === 'journal' && <Badge count={journalBadge} className="-top-0.5 -right-0.5" />}
      </Link>
    );
  };
  return (
    <aside className="sticky top-0 z-40 hidden h-dvh w-16 shrink-0 flex-col items-center gap-2 border-r bg-chrome py-3 backdrop-blur-xl md:flex">
      <Link
        href={guest ? '/backtest' : '/'}
        aria-label={guest ? 'Backtest Lab' : 'Back to hub'}
        className="mb-2 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#b4a2ff] font-bold text-primary-foreground text-sm shadow-[0_6px_20px_-6px_rgb(79_209_224/0.7)]"
      >
        TH
      </Link>
      <nav aria-label="Modules" className="flex flex-col items-center gap-1.5">
        {(guest ? [BACKTEST] : [HUB, TRACKER, JOURNAL, NEWS, BACKTEST]).map(item)}
      </nav>
      {!guest && <div className="mt-auto">{item(SETTINGS)}</div>}
    </aside>
  );
}

/** Phone: bottom tab bar. "More" holds Backtest and Settings. */
export function AppBottomBar({ journalBadge = 0 }: { journalBadge?: number }) {
  const active = activeId(usePathname());
  const tab = (link: AppLink, ariaLabel?: string) => {
    const Icon = link.icon;
    const on = active === link.id;
    return (
      <Link
        key={link.id}
        href={link.href}
        aria-label={ariaLabel}
        aria-current={on ? 'page' : undefined}
        className={cn(
          'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground',
          on && 'font-medium text-primary',
        )}
      >
        <Icon className="size-5" aria-hidden strokeWidth={1.8} />
        {link.label}
        {link.id === 'journal' && <Badge count={journalBadge} className="top-2 left-1/2 ml-1.5" />}
      </Link>
    );
  };
  const moreOn = active === 'backtest' || active === 'settings';
  return (
    <nav
      aria-label="Modules"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-[#2b313c]/90 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-xl md:hidden"
    >
      {tab(HUB, 'Back to hub')}
      {tab(TRACKER)}
      {tab(JOURNAL)}
      {tab(NEWS)}
      <details className="group relative">
        <summary
          className={cn(
            'flex h-16 cursor-pointer list-none flex-col items-center justify-center gap-1 text-[11px] text-muted-foreground [&::-webkit-details-marker]:hidden',
            moreOn && 'font-medium text-primary',
          )}
        >
          <Ellipsis className="size-5" aria-hidden strokeWidth={1.8} />
          More
        </summary>
        <div className="absolute right-2 bottom-[4.5rem] flex min-w-44 flex-col rounded-xl border bg-popover p-1 shadow-xl">
          {[BACKTEST, SETTINGS].map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.id}
                href={link.href}
                className="flex h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent"
              >
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {link.label}
              </Link>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
