import { createLoader, parseAsString } from 'nuqs/server';

/** News URL state (news spec §2): week shown, filters, open event. */
export const newsSearchParams = {
  week: parseAsString.withOptions({ shallow: false }),
  impact: parseAsString.withOptions({ shallow: false }),
  currency: parseAsString.withOptions({ shallow: false }),
  restricted: parseAsString.withOptions({ shallow: false }),
  event: parseAsString.withOptions({ shallow: false, scroll: false }),
};

export const loadNewsSearchParams = createLoader(newsSearchParams);

/** Filter params kept when moving between weeks and News pages. */
export const NEWS_FILTER_PARAMS = ['impact', 'currency', 'restricted'] as const;
