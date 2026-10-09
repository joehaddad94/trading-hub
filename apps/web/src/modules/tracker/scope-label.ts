import type { Scope } from '@trading/core';

export type ScopeOption = { login: number; phase: string; status: string; isDemo: boolean; journeyRootLogin: number };

export const PHASE_LABELS: Record<string, string> = {
  p1: 'P1',
  p2: 'P2',
  funded: 'Funded',
  instant: 'Instant',
  other: 'Other',
};

/** `7002880 · Funded` — how every trade and account is labelled (§8.1). */
export function accountLabel(a: Pick<ScopeOption, 'login' | 'phase'>) {
  return `${a.login} · ${PHASE_LABELS[a.phase] ?? a.phase}`;
}

export function scopeLabel(scope: Scope, accounts: ScopeOption[]): string {
  const find = (login: string) => accounts.find((a) => String(a.login) === login);
  switch (scope.kind) {
    case 'all':
      return 'All live accounts';
    case 'demo':
      return 'Demo only';
    case 'funded':
      return 'Funded only';
    case 'backtest':
      return 'Backtest';
    case 'account': {
      const a = find(scope.login);
      return a ? accountLabel(a) : `Account ${scope.login}`;
    }
    case 'journey':
      return `Journey from ${scope.id}`;
    case 'accounts':
      return `${scope.logins.length} accounts`;
  }
}

/** Journeys with more than one account, keyed by root login. */
export function journeys(accounts: ScopeOption[]) {
  const byRoot = new Map<number, ScopeOption[]>();
  for (const a of accounts) byRoot.set(a.journeyRootLogin, [...(byRoot.get(a.journeyRootLogin) ?? []), a]);
  return [...byRoot.entries()].filter(([, chain]) => chain.length > 1);
}
