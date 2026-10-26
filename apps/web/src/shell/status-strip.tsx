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
  dock = false,
}: {
  tone: 'error' | 'warning';
  title: string;
  items: StatusItem[];
  link?: { href: Route; label: string } | undefined;
  /**
   * Full-screen workspaces (Backtest Lab) on a phone: just the coloured dot in the header's corner, the list
   * opening under it, so a warning doesn't take chart height (audit 25 Oct, #9).
   */
  dock?: boolean;
}) {
  const [first] = items;
  if (!first) return null;
  const more = items.length - 1;
  return (
    <div
      role="alert"
      className={cn(
        'border-b px-4 text-sm',
        tone === 'error' ? 'border-loss/40 bg-loss/10' : 'border-warning/40 bg-warning/10',
        dock && 'compact:relative compact:rounded-full compact:border compact:px-0',
      )}
      data-dock={dock ? 'true' : undefined}
    >
      <details className="group mx-auto max-w-5xl">
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center gap-2 py-1.5 [&::-webkit-details-marker]:hidden',
            dock && 'compact:size-8 compact:justify-center compact:py-0',
          )}
          title={dock ? `${title}: ${first.message}` : undefined}
        >
          <span
            aria-hidden
            className={cn('h-2 w-2 shrink-0 rounded-full', tone === 'error' ? 'bg-loss' : 'bg-warning')}
          />
          <span className={cn('shrink-0 font-medium', tone === 'error' && 'text-loss', dock && 'compact:sr-only')}>
            {title}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-muted-foreground group-open:invisible',
              dock && 'compact:hidden',
            )}
          >
            {first.message}
          </span>
          <span
            className={cn(
              'shrink-0 text-muted-foreground text-xs underline underline-offset-4',
              dock && 'compact:hidden',
            )}
          >
            <span className="group-open:hidden">{more > 0 ? `+${more} more` : 'Details'}</span>
            <span className="hidden group-open:inline">Hide</span>
          </span>
        </summary>
        <div
          className={cn(
            'flex flex-col gap-1 pb-2',
            dock &&
              'compact:absolute compact:top-full compact:right-0 compact:mt-1 compact:w-72 compact:rounded-md compact:border compact:bg-popover compact:p-2 compact:shadow-lg',
          )}
        >
          {dock && <p className="hidden font-medium compact:block">{title}</p>}
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
