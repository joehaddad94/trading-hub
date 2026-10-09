import Link from 'next/link';
import type { ReactNode } from 'react';
import { MODULES, type ModuleId } from './modules';

/** Header shared by every module: app name → hub, module name, shortcut to the other modules, module controls. */
export function ModuleHeader({ moduleId, children }: { moduleId: ModuleId | 'settings'; children?: ReactNode }) {
  const title = MODULES.find((m) => m.id === moduleId)?.name ?? 'Settings';
  const others = MODULES.filter((m) => m.id !== moduleId);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <Link href="/" className="font-semibold" aria-label="Back to hub">
        Trading Hub
      </Link>
      <span className="text-muted-foreground" aria-hidden>
        /
      </span>
      <h1 className="font-medium">{title}</h1>
      <nav aria-label="Other modules" className="ml-2 hidden items-center gap-1 md:flex">
        {others.map((m) => (
          <Link
            key={m.id}
            href={m.href}
            className="rounded-md px-2 py-1 text-muted-foreground text-sm hover:bg-accent hover:text-accent-foreground"
          >
            {m.name}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {children}
        <details className="relative md:hidden">
          <summary className="flex h-11 cursor-pointer list-none items-center rounded-md px-2 text-muted-foreground text-sm">
            Modules
          </summary>
          <nav
            aria-label="Switch module"
            className="absolute right-0 mt-1 flex min-w-40 flex-col rounded-md border bg-popover p-1 shadow-md"
          >
            <Link href="/" className="flex h-11 items-center rounded-sm px-3 text-sm hover:bg-accent">
              Hub
            </Link>
            {others.map((m) => (
              <Link key={m.id} href={m.href} className="flex h-11 items-center rounded-sm px-3 text-sm hover:bg-accent">
                {m.name}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
