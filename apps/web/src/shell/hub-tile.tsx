import { ArrowUpRight } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/** Tile shell shared by the hub's module tiles: icon title, body, and an "Open …" link. */
export function HubTile({
  title,
  icon,
  href,
  linkLabel,
  index,
  children,
}: {
  title: string;
  icon: ReactNode;
  href: Route;
  linkLabel: string;
  index: number;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="glass rise flex min-w-0 flex-col gap-3 rounded-2xl p-5 transition-transform hover:-translate-y-0.5"
      style={{ '--i': index } as CSSProperties}
    >
      <h2 className="flex items-center gap-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {icon}
        {title}
      </h2>
      <div className="flex-1 text-sm">{children}</div>
      <Link
        href={href}
        className="group inline-flex min-h-11 items-center gap-1 self-start font-medium text-primary text-sm md:min-h-0"
      >
        {linkLabel}
        <ArrowUpRight
          className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          aria-hidden
        />
      </Link>
    </section>
  );
}
