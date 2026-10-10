import { parseScope } from '@trading/core';
import { describe, expect, it } from 'vitest';
import { accountLabel, journeys, type ScopeOption, scopeLabel } from './scope-label';

const accounts: ScopeOption[] = [
  { login: 3027687, phase: 'p1', status: 'passed', isDemo: true, journeyRootLogin: 3027687 },
  { login: 3028722, phase: 'p2', status: 'breached', isDemo: true, journeyRootLogin: 3027687 },
  { login: 7002880, phase: 'funded', status: 'active', isDemo: false, journeyRootLogin: 7002880 },
];

describe('scope labels', () => {
  it.each([
    ['all', 'All live accounts'],
    ['demo', 'Demo only'],
    ['funded', 'Funded only'],
    ['backtest', 'Backtest'],
    ['account:7002880', '7002880 · Funded'],
    ['account:1', 'Account 1'],
    ['journey:3027687', 'Journey from 3027687'],
    ['accounts:1,2', '2 accounts'],
  ])('%s', (value, label) => {
    expect(scopeLabel(parseScope(value), accounts)).toBe(label);
  });

  it('labels accounts and groups journeys', () => {
    expect(accountLabel({ login: 1, phase: 'weird' })).toBe('1 · weird');
    expect(journeys(accounts).map(([root, chain]) => [root, chain.length])).toEqual([[3027687, 2]]);
  });
});
