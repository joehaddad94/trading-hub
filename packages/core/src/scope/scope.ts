/**
 * Tracker scope (spec §8.1) as it lives in the URL: `?scope=account:7002880`, `?scope=journey:<id>`,
 * `?scope=accounts:a,b`. Parsing is pure; turning a scope into account ids happens server-side.
 */
export type Scope =
  | { kind: 'all' }
  | { kind: 'demo' }
  | { kind: 'funded' }
  | { kind: 'backtest' }
  | { kind: 'account'; login: string }
  | { kind: 'journey'; id: string }
  | { kind: 'accounts'; logins: string[] };

export const DEFAULT_SCOPE: Scope = { kind: 'all' };

const TOKEN = /^[A-Za-z0-9_-]{1,64}$/;

export function parseScope(value: string | null | undefined): Scope {
  if (!value) return DEFAULT_SCOPE;
  const [kind, rest = ''] = splitOnce(value, ':');
  switch (kind) {
    case 'all':
    case 'demo':
    case 'funded':
    case 'backtest':
      return rest ? DEFAULT_SCOPE : { kind };
    case 'account':
      return TOKEN.test(rest) ? { kind, login: rest } : DEFAULT_SCOPE;
    case 'journey':
      return TOKEN.test(rest) ? { kind, id: rest } : DEFAULT_SCOPE;
    case 'accounts': {
      const logins = [...new Set(rest.split(',').filter((l) => TOKEN.test(l)))];
      if (logins.length === 0) return DEFAULT_SCOPE;
      return logins.length === 1 && logins[0] ? { kind: 'account', login: logins[0] } : { kind, logins };
    }
    default:
      return DEFAULT_SCOPE;
  }
}

export function serializeScope(scope: Scope): string {
  switch (scope.kind) {
    case 'account':
      return `account:${scope.login}`;
    case 'journey':
      return `journey:${scope.id}`;
    case 'accounts':
      return `accounts:${scope.logins.join(',')}`;
    default:
      return scope.kind;
  }
}

function splitOnce(value: string, sep: string): [string, string?] {
  const i = value.indexOf(sep);
  return i === -1 ? [value] : [value.slice(0, i), value.slice(i + 1)];
}
