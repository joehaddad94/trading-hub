'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ComponentProps, Suspense, useEffect, useRef, useState } from 'react';
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

/** Fades the edge(s) the tab row can still scroll towards, so a phone shows there are more pages. */
function edgeMask(left: boolean, right: boolean) {
  if (!left && !right) return undefined;
  const from = left ? 'transparent, #000 1.5rem' : '#000';
  const to = right ? '#000 calc(100% - 1.5rem), transparent' : '#000';
  return `linear-gradient(90deg, ${from}, ${to})`;
}

/**
 * The module's own pages as pill tabs in the bar (navbar redesign A). When they don't fit (Tracker on a phone) the
 * row scrolls sideways, fades at the edge that has more, and starts scrolled to the current page.
 */
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
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const nav = ref.current;
    // Re-run on navigation: the current page's tab moves.
    if (!nav || !pathname) return;
    const current = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (current) {
      const { offsetLeft, offsetWidth } = current;
      if (offsetLeft + offsetWidth > nav.scrollLeft + nav.clientWidth || offsetLeft < nav.scrollLeft) {
        nav.scrollLeft = offsetLeft - (nav.clientWidth - offsetWidth) / 2;
      }
    }
    const update = () =>
      setEdges({
        left: nav.scrollLeft > 1,
        right: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1,
      });
    update();
    nav.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      nav.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [pathname]);

  const mask = edgeMask(edges.left, edges.right);
  return (
    <nav
      ref={ref}
      aria-label="Module"
      className={cn(
        'flex gap-0.5 overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
    >
      {items.map((item) => {
        const on = isActive(pathname, item.href, rootHref);
        return (
          <NavLink
            key={item.href}
            href={item.href}
            keep={keep}
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 roomy:h-8',
              on && 'bg-popover font-medium text-foreground shadow-sm ring-1 ring-border',
            )}
          >
            <ItemLabel item={item} />
          </NavLink>
        );
      })}
    </nav>
  );
}
