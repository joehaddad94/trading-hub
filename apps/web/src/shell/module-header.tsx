import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ModuleTabs } from './module-nav';
import type { NavItem } from './modules';

/**
 * Sticky glass header for a module, kept to one slim row: Hub button, title, the module's pages as tabs, then module
 * controls. On a phone a module with controls (Tracker's scope) puts its tabs on a second row instead.
 */
export function ModuleHeader({
  title,
  nav,
  rootHref,
  keep,
  leading,
  trailing,
  dockedStatus = false,
  children,
}: {
  title: string;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  /** Before the title: the Hub button. */
  leading?: ReactNode;
  /** After the controls: an invited user's theme and Log out. */
  trailing?: ReactNode;
  /** A phone docks the status dots in the top-right corner (Backtest Lab): keep the header's end clear of them. */
  dockedStatus?: boolean;
  children?: ReactNode;
}) {
  const tabs = nav && nav.length > 1;
  const end = children || trailing;
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center border-b bg-chrome backdrop-blur-xl md:flex-nowrap',
        // The docked status dots sit fixed in the top-right corner: tabs and buttons stop short of them.
        dockedStatus && 'compact:pr-20',
      )}
    >
      {leading && <div className="flex shrink-0 items-center pl-1 md:pl-3">{leading}</div>}
      <h1
        className={cn(
          'flex h-11 shrink-0 items-center font-semibold text-base tracking-tight md:h-12 md:pr-2',
          leading ? 'pr-2 pl-1 md:pl-1' : 'px-4 md:pl-6',
        )}
      >
        {title}
      </h1>
      {tabs && (
        <ModuleTabs
          items={nav}
          rootHref={rootHref ?? nav[0]?.href ?? '/'}
          keep={keep}
          className={cn('min-w-0 flex-1', children ? 'order-last basis-full md:order-none md:basis-auto' : '')}
        />
      )}
      {end && (
        <div
          className={cn('ml-auto flex min-w-0 items-center gap-2 pr-4 pl-2 md:pr-6', dockedStatus && 'compact:pr-16')}
        >
          {children}
          {trailing}
        </div>
      )}
    </header>
  );
}
