'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ComponentProps, Suspense } from 'react';
import { cn } from '@/lib/utils';
import type { NavItem } from './modules';

type LinkProps = Omit<ComponentProps<typeof Link>, 'href'> & { href: Route; keep?: string[] | undefined };

/** A nav link that carries module-wide query params (e.g. the Tracker `scope`, §8.1) to the next page. */
function NavLink({ href, keep, ...props }: LinkProps) {
  if (!keep?.length) return <Link href={href} {...props} />;
  return (
    <Suspense fallback={<Link href={href} {...props} />}>
      <LinkKeepingParams href={href} keep={keep} {...props} />
    </Suspense>
  );
}

function LinkKeepingParams({ href, keep, ...props }: LinkProps & { keep: string[] }) {
  const params = useSearchParams();
  const kept = new URLSearchParams();
  for (const key of keep) {
    const value = params.get(key);
    if (value) kept.set(key, value);
  }
  const query = kept.toString();
  return <Link href={(query ? `${href}?${query}` : href) as Route} {...props} />;
}

function ItemLabel({ item }: { item: NavItem }) {
  if (!item.badge) return item.label;
  return (
    <>
      {item.label}
      <span
        className="ml-1.5 rounded-full bg-warning/20 px-1.5 text-[11px] text-warning num"
        data-testid={`nav-badge-${item.label.toLowerCase()}`}
      >
        {item.badge}
      </span>
    </>
  );
}

function isActive(pathname: string, href: string, rootHref: string) {
  return href === rootHref ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The module's own pages as tabs in the header (desktop and phone; scrolls sideways when narrow). */
export function ModuleTabs({
  items,
  rootHref,
  keep,
  className,
}: {
  items: NavItem[];
  rootHref: string;
  keep?: string[] | undefined;
  className?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Module" className={cn('-mb-px flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]', className)}>
      {items.map((item) => {
        const on = isActive(pathname, item.href, rootHref);
        return (
          <NavLink
            key={item.href}
            href={item.href}
            keep={keep}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex h-11 shrink-0 items-center border-transparent border-b-2 px-3 md:h-12 text-muted-foreground text-sm transition-colors hover:text-foreground',
              on && 'border-primary font-medium text-foreground',
            )}
          >
            <ItemLabel item={item} />
          </NavLink>
        );
      })}
    </nav>
  );
}
