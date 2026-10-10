import { describe, expect, it } from 'vitest';
import { parseScope, serializeScope } from './scope';

describe('parseScope', () => {
  it.each([
    [null, { kind: 'all' }],
    ['', { kind: 'all' }],
    ['all', { kind: 'all' }],
    ['demo', { kind: 'demo' }],
    ['funded', { kind: 'funded' }],
    ['backtest', { kind: 'backtest' }],
    ['account:7002880', { kind: 'account', login: '7002880' }],
    ['journey:abc-123', { kind: 'journey', id: 'abc-123' }],
    ['accounts:1,2,2', { kind: 'accounts', logins: ['1', '2'] }],
    ['accounts:9', { kind: 'account', login: '9' }],
  ] as const)('%s', (input, expected) => {
    expect(parseScope(input)).toEqual(expected);
  });

  it.each(['nope', 'account:', 'account:a b', 'accounts:', 'demo:1', "journey:x';--"])(
    'falls back to all for %s',
    (v) => {
      expect(parseScope(v)).toEqual({ kind: 'all' });
    },
  );

  it('round-trips', () => {
    for (const v of ['all', 'funded', 'account:7002880', 'journey:j1', 'accounts:a,b']) {
      expect(serializeScope(parseScope(v))).toBe(v);
    }
  });
});
