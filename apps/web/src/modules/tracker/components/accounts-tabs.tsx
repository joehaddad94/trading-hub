import Link from 'next/link';
import { cn } from '@/lib/utils';

/** Accounts / Demo vs Funded switch. */
export function AccountsTabs({ current }: { current: 'list' | 'compare' }) {
  const tab = 'flex h-11 items-center border-b-2 px-3 text-sm md:h-9';
  return (
    <nav aria-label="Accounts views" className="flex gap-1 border-b">
      <Link
        href="/tracker/accounts"
        aria-current={current === 'list' ? 'page' : undefined}
        className={cn(
          tab,
          current === 'list' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground',
        )}
      >
        Journeys
      </Link>
      <Link
        href="/tracker/accounts/compare"
        aria-current={current === 'compare' ? 'page' : undefined}
        className={cn(
          tab,
          current === 'compare' ? 'border-foreground font-medium' : 'border-transparent text-muted-foreground',
        )}
      >
        Demo vs Funded
      </Link>
    </nav>
  );
}
