import { COMMON_CURRENCIES, IMPACT_LABELS, IMPACTS, type NewsFilters } from '@trading/news';
import Link from 'next/link';
import { Glyph } from '@/components/glyph';
import { cn } from '@/lib/utils';
import { newsHref } from '../links';
import { Folder } from './folder';
import { RememberFilters } from './remember-filters';

const chip = (on: boolean) =>
  cn(
    'inline-flex h-11 items-center gap-1.5 rounded-full border px-3 text-sm md:h-8',
    on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
  );

/** Impact / currency / restricted chips (news spec §2). Plain links: the URL is the filter state. */
export function NewsFilterBar({
  path,
  filters,
  keep,
}: {
  path: string;
  filters: NewsFilters;
  keep?: Record<string, string | null | undefined>;
}) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const currencies = [...new Set([...COMMON_CURRENCIES, ...filters.currencies])];
  return (
    <div className="flex flex-col gap-2" data-testid="news-filters">
      <RememberFilters />
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Impact</legend>
        {IMPACTS.map((impact) => {
          const on = filters.impacts.includes(impact);
          const next = toggle(filters.impacts, impact);
          return (
            <Link
              key={impact}
              href={newsHref(path, { ...filters, impacts: next.length ? next : filters.impacts }, keep, true)}
              aria-pressed={on}
              className={chip(on)}
              scroll={false}
            >
              <Folder impact={impact} />
              {IMPACT_LABELS[impact]}
            </Link>
          );
        })}
        <Link
          href={newsHref(path, { ...filters, restrictedOnly: !filters.restrictedOnly }, keep, true)}
          aria-pressed={filters.restrictedOnly}
          className={chip(filters.restrictedOnly)}
          scroll={false}
        >
          <Glyph kind="restricted" /> Restricted only
        </Link>
      </fieldset>
      <fieldset className="flex min-w-0 gap-2 overflow-x-auto pb-1">
        <legend className="sr-only">Currency</legend>
        {currencies.map((c) => {
          const on = filters.currencies.includes(c);
          const next = toggle(filters.currencies, c);
          return (
            <Link
              key={c}
              href={newsHref(path, { ...filters, currencies: next.length ? next : filters.currencies }, keep, true)}
              aria-pressed={on}
              className={cn(chip(on), 'shrink-0')}
              scroll={false}
            >
              {c}
            </Link>
          );
        })}
      </fieldset>
    </div>
  );
}
