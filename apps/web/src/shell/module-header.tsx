import type { ReactNode } from 'react';
import { ModuleTabs } from './module-nav';
import type { NavItem } from './modules';

/** Sticky glass header for a module: title and module controls, then the module's pages as tabs. */
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
  return (
    <header className="sticky top-0 z-20 border-b bg-chrome backdrop-blur-xl">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <h1 className="shrink-0 font-semibold text-lg tracking-tight">{title}</h1>
        <div className="ml-auto flex min-w-0 items-center gap-2">{children}</div>
      </div>
      {nav && nav.length > 1 && <ModuleTabs items={nav} rootHref={rootHref ?? nav[0]?.href ?? '/'} keep={keep} />}
    </header>
  );
}
