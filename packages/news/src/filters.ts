import type { NewsImpact } from '@trading/core';

export const IMPACTS: NewsImpact[] = ['high', 'medium', 'low', 'holiday'];

export const IMPACT_LABELS: Record<NewsImpact, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  holiday: 'Holiday',
};

/** Currencies offered as filter chips (the firm lists these most); others still show when selected. */
export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'NZD', 'CHF', 'CNY'];

export type NewsFilters = { impacts: NewsImpact[]; currencies: string[]; restrictedOnly: boolean };

/** News spec §2 defaults: red folders only, USD only (Joe trades US30 and NAS100). */
export const DEFAULT_FILTERS: NewsFilters = { impacts: ['high'], currencies: ['USD'], restrictedOnly: false };

const list = (v: string | null | undefined) =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** `impact=high,medium&currency=USD,EUR&restricted=1` → filters; unknown values are dropped. */
export function parseNewsFilters(
  params: { impact?: string | null; currency?: string | null; restricted?: string | null },
  defaults: NewsFilters = DEFAULT_FILTERS,
): NewsFilters {
  const impacts = list(params.impact).filter((i): i is NewsImpact => (IMPACTS as string[]).includes(i));
  const currencies = list(params.currency)
    .map((c) => c.toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c));
  return {
    impacts:
      params.impact === undefined || params.impact === null
        ? defaults.impacts
        : impacts.length
          ? impacts
          : defaults.impacts,
    currencies:
      params.currency === undefined || params.currency === null
        ? defaults.currencies
        : currencies.length
          ? [...new Set(currencies)]
          : defaults.currencies,
    restrictedOnly: params.restricted === '1',
  };
}

/** Filters → query params; defaults are left out so URLs stay short. */
export function serializeNewsFilters(f: NewsFilters, defaults: NewsFilters = DEFAULT_FILTERS) {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  return {
    impact: same(f.impacts, defaults.impacts) ? null : f.impacts.join(','),
    currency: same(f.currencies, defaults.currencies) ? null : f.currencies.join(','),
    restricted: f.restrictedOnly ? '1' : null,
  };
}
