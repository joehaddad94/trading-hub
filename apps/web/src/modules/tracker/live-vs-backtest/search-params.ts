import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server';

export const PERIOD_KINDS = ['week', 'month', 'all'] as const;
export const BACKTEST_VIEWS = ['onepick', 'portfolio'] as const;
export type BacktestView = (typeof BACKTEST_VIEWS)[number];

/** Live vs backtest URL state: period kind, which period (`at`), and how the backtest counts sessions. */
export const liveVsBacktestSearchParams = {
  period: parseAsStringLiteral(PERIOD_KINDS).withDefault('month'),
  at: parseAsString,
  view: parseAsStringLiteral(BACKTEST_VIEWS).withDefault('onepick'),
};

export const loadLiveVsBacktestSearchParams = createLoader(liveVsBacktestSearchParams);
