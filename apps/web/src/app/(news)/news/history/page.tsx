import { DEFAULT_FILTERS, parseNewsFilters } from '@trading/news';
import Link from 'next/link';
import type { SearchParams } from 'nuqs/server';
import { formatBeirut } from '@/lib/format';
import { Folder } from '@/modules/news/components/folder';
import { NewsFilterBar } from '@/modules/news/components/news-filters';
import { newsHref } from '@/modules/news/links';
import { getEventTitles, getNewsSettingsOrDefault, getOccurrences } from '@/modules/news/server/news';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export const metadata = { title: 'History · News' };

/** Event history (news module nav): every event seen, searchable; one event's past forecast/previous. */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const settings = await getNewsSettingsOrDefault();
  const filters = parseNewsFilters(
    { impact: one(raw.impact) ?? null, currency: one(raw.currency) ?? null, restricted: one(raw.restricted) ?? null },
    { ...DEFAULT_FILTERS, currencies: settings.currencies },
  );
  const q = one(raw.q)?.trim().slice(0, 100) || undefined;
  const title = one(raw.title)?.slice(0, 200);
  const currency = one(raw.currency_of)?.slice(0, 3);
  const [allTitles, shown] = await Promise.all([
    getEventTitles(q, filters.currencies),
    title && currency ? getOccurrences(title, currency) : Promise.resolve([]),
  ]);

  const titles = allTitles.filter((t) => filters.impacts.includes(t.impact));

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Event history</h2>
      <form method="get" className="flex gap-2" aria-label="Event search">
        {(['impact', 'currency', 'restricted'] as const).map((k) => {
          const v = one(raw[k]);
          return v ? <input key={k} type="hidden" name={k} value={v} /> : null;
        })}
        <input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search events (e.g. CPI, FOMC)"
          aria-label="Search events"
          className="h-11 w-full max-w-md rounded-md border bg-background px-3 text-base md:h-9 md:text-sm"
        />
        <button type="submit" className="h-11 rounded-md border px-3 text-sm hover:bg-accent md:h-9">
          Search
        </button>
      </form>
      <NewsFilterBar path="/news/history" filters={filters} keep={{ q: q ?? null }} />
      <div className="grid gap-4 md:grid-cols-2">
        <ul className="flex flex-col gap-1" data-testid="event-titles">
          {titles.length === 0 && <li className="text-muted-foreground text-sm">No events.</li>}
          {titles.map((t) => (
            <li key={`${t.currency}-${t.title}`}>
              <Link
                href={newsHref(
                  '/news/history',
                  filters,
                  { q: q ?? null, title: t.title, currency_of: t.currency },
                  true,
                )}
                className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Folder impact={t.impact} />
                  <span className="font-medium">{t.currency}</span>
                  <span className="truncate">{t.title}</span>
                </span>
                <span className="shrink-0 text-muted-foreground text-xs">
                  {t.occurrences}× · last {formatBeirut(t.lastAt, 'd MMM yy')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {title && (
          <section aria-label={`${currency} ${title}`} className="rounded-lg border p-3" data-testid="occurrences">
            <h3 className="mb-2 font-medium">
              {currency} · {title}
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs">
                  <th className="py-1 font-normal">When (Beirut)</th>
                  <th className="py-1 font-normal">Forecast</th>
                  <th className="py-1 font-normal">Previous</th>
                  <th className="py-1 font-normal">
                    <span className="sr-only">Restricted</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} className="border-t">
                    <td className="py-1 tabular-nums">{formatBeirut(o.eventAt, 'd MMM yyyy HH:mm')}</td>
                    <td className="py-1">{o.forecast ?? '—'}</td>
                    <td className="py-1">{o.previous ?? '—'}</td>
                    <td className="py-1">{o.isRestricted ? '🔒' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  );
}
