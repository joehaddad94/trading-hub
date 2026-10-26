import { describe, expect, it } from 'vitest';
import { accessFor } from './access';

describe('accessFor', () => {
  it('sends signed-out visitors to sign in, keeping where they were going', () => {
    expect(accessFor('/', null)).toEqual({ kind: 'redirect', to: '/login' });
    expect(accessFor('/backtest/chart', null)).toEqual({ kind: 'redirect', to: '/login?next=%2Fbacktest%2Fchart' });
    expect(accessFor('/api/backtest/candles', null)).toMatchObject({ kind: 'redirect' });
    expect(accessFor('/login', null)).toEqual({ kind: 'allow' });
    expect(accessFor('/auth/callback', null)).toEqual({ kind: 'allow' });
  });

  it('lets the owner in everywhere', () => {
    for (const p of ['/', '/tracker', '/news', '/settings/users', '/backtest', '/api/tracker/trades.csv']) {
      expect(accessFor(p, 'owner')).toEqual({ kind: 'allow' });
    }
    expect(accessFor('/login', 'owner')).toEqual({ kind: 'redirect', to: '/' });
  });

  it('keeps invited users in the Backtest Lab', () => {
    for (const p of ['/backtest', '/backtest/chart', '/backtest/sessions/x', '/api/backtest/candles/next']) {
      expect(accessFor(p, 'guest')).toEqual({ kind: 'allow' });
    }
    for (const p of ['/', '/tracker', '/tracker/journal', '/news', '/settings', '/settings/users', '/backtesting']) {
      expect(accessFor(p, 'guest')).toEqual({ kind: 'redirect', to: '/backtest' });
    }
    expect(accessFor('/api/tracker/trades.csv', 'guest')).toEqual({ kind: 'forbidden' });
    expect(accessFor('/login', 'guest')).toEqual({ kind: 'redirect', to: '/backtest' });
  });
});
