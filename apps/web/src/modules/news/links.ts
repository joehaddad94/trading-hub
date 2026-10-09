import { type NewsFilters, serializeNewsFilters } from '@trading/news';
import type { Route } from 'next';

/**
 * A News URL with filters and any extra params. Defaults are left out unless `explicit`: links that change
 * a filter always spell it out, so a param-less URL only ever means "use the remembered filters".
 */
export function newsHref(
  path: string,
  filters: NewsFilters,
  extra: Record<string, string | null | undefined> = {},
  explicit = false,
) {
  const q = new URLSearchParams();
  const own = explicit
    ? {
        impact: filters.impacts.join(','),
        currency: filters.currencies.join(','),
        restricted: filters.restrictedOnly ? '1' : null,
      }
    : serializeNewsFilters(filters);
  for (const [k, v] of Object.entries({ ...own, ...extra })) if (v) q.set(k, v);
  const s = q.toString();
  return (s ? `${path}?${s}` : path) as Route;
}
