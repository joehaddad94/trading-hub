'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavItem } from './modules';

function isActive(pathname: string, href: string, rootHref: string) {
  return href === rootHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop: left sidebar. */
export function ModuleSidebar({ items, rootHref }: { items: NavItem[]; rootHref: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Module" className="hidden w-52 shrink-0 flex-col gap-1 border-r p-3 md:flex">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href, rootHref) ? 'page' : undefined}
          className={cn(
            'flex h-11 items-center rounded-md px-3 text-sm hover:bg-accent',
            isActive(pathname, item.href, rootHref) && 'bg-accent font-medium',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone: bottom tab bar (Tracker) — first four items plus "More" for the rest and Settings. */
export function ModuleBottomTabs({ items, rootHref }: { items: NavItem[]; rootHref: string }) {
  const pathname = usePathname();
  const primary = items.slice(0, 4);
  const more: NavItem[] = [...items.slice(4), { href: '/settings', label: 'Settings' }];
  return (
    <nav
      aria-label="Module"
      className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background md:hidden"
    >
      {primary.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href, rootHref) ? 'page' : undefined}
          className={cn(
            'flex h-14 items-center justify-center text-muted-foreground text-xs',
            isActive(pathname, item.href, rootHref) && 'font-medium text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
      <details className="group relative">
        <summary className="flex h-14 cursor-pointer list-none items-center justify-center text-muted-foreground text-xs">
          More
        </summary>
        <div className="absolute right-2 bottom-16 flex min-w-40 flex-col rounded-md border bg-popover p-1 shadow-md">
          {more.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-11 items-center rounded-sm px-3 text-sm hover:bg-accent"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </details>
    </nav>
  );
}

/** Phone: top tabs (News). */
export function ModuleTopTabs({ items, rootHref }: { items: NavItem[]; rootHref: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Module" className="flex gap-1 overflow-x-auto border-b px-2 md:hidden">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href, rootHref) ? 'page' : undefined}
          className={cn(
            'flex h-11 shrink-0 items-center px-3 text-muted-foreground text-sm',
            isActive(pathname, item.href, rootHref) && 'border-foreground border-b-2 font-medium text-foreground',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
