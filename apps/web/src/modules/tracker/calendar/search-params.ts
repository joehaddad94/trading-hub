import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server';

export const CELL_MODES = ['net', 'r', 'count', 'winrate', 'pct'] as const;
export type CellMode = (typeof CELL_MODES)[number];

export const CELL_MODE_LABELS: Record<CellMode, string> = {
  net: 'Net $',
  r: 'R',
  count: 'Trades',
  winrate: 'Win rate',
  pct: '% of balance',
};

/** Calendar URL state (§8.2): month shown, day open in the day view, what each cell's main number is. */
export const calendarSearchParams = {
  month: parseAsString.withOptions({ shallow: false }),
  day: parseAsString.withOptions({ shallow: false, scroll: false }),
  cell: parseAsStringLiteral(CELL_MODES).withDefault('net').withOptions({ shallow: false, scroll: false }),
};

export const loadCalendarSearchParams = createLoader(calendarSearchParams);
