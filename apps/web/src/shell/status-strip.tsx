import type { Route } from 'next';
import Link from 'next/link';
import { formatBeirut } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StatusItem = { key: string; message: string; since?: Date | null | undefined };

/**
 * One slim line under the header for sync and market-data problems. The first problem shows inline;
 * the full list opens in place (native <details>, no JS), so a warning never pushes the page down.
 */
export function StatusStrip({
  tone,
  title,
  items,
  link,
}: {
  tone: 'error' | 'warning';
  title: string;
  items: StatusItem[];
  link?: { href: Route; label: string } | undefined;
}) {
  const [first] = items;
  if (!first) return null;
  const more = items.length - 1;
  return (
    <div
      role="alert"
      className={cn(
        'border-b px-4 text-sm',
        tone === 'error' ? 'border-loss/40 bg-loss/10' : 'border-amber-500/40 bg-amber-500/10',
      )}
    >
      <details className="group mx-auto max-w-5xl">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className={cn('h-2 w-2 shrink-0 rounded-full', tone === 'error' ? 'bg-loss' : 'bg-amber-500')}
          />
          <span className={cn('shrink-0 font-medium', tone === 'error' && 'text-loss')}>{title}</span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground group-open:invisible">{first.message}</span>
          <span className="shrink-0 text-muted-foreground text-xs underline underline-offset-4">
            <span className="group-open:hidden">{more > 0 ? `+${more} more` : 'Details'}</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div className="flex flex-col gap-1 pb-2">
          <ul className="flex flex-col gap-1">
            {items.map((c) => (
              <li key={c.key} className="break-words">
                {c.message}
                {c.since && <span className="text-muted-foreground"> · since {formatBeirut(c.since)}</span>}
              </li>
            ))}
          </ul>
          {link && (
            <Link href={link.href} className="self-start font-medium underline underline-offset-4">
              {link.label}
            </Link>
          )}
        </div>
      </details>
    </div>
  );
}
