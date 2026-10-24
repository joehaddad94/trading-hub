import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ModuleTabs } from './module-nav';
import type { NavItem } from './modules';

/**
 * Sticky glass header for a module, kept to one slim row: title, the module's pages as tabs, then module
 * controls. On a phone a module with controls (Tracker's scope) puts its tabs on a second row instead.
 */
export function ModuleHeader({
  title,
  nav,
  rootHref,
  keep,
  children,
}: {
  title: string;
  nav?: NavItem[] | undefined;
  rootHref?: string | undefined;
  keep?: string[] | undefined;
  children?: ReactNode;
}) {
  const tabs = nav && nav.length > 1;
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center border-b bg-chrome backdrop-blur-xl md:flex-nowrap">
      <h1 className="flex h-11 shrink-0 items-center px-4 font-semibold text-base tracking-tight md:h-12 md:pr-2 md:pl-6">
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
      {children && <div className="ml-auto flex min-w-0 items-center gap-2 pr-4 pl-2 md:pr-6">{children}</div>}
    </header>
  );
}
