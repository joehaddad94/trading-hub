import { DEFAULT_SCOPE, type Scope } from '@trading/core';
import type { Executor } from '@trading/db';
import { and, asc, eq, sql } from '@trading/db/orm';
import { accounts } from '@trading/db/schema';

export type ScopeAccount = {
  id: string;
  login: number;
  phase: (typeof accounts.$inferSelect)['phase'];
  status: (typeof accounts.$inferSelect)['status'];
  isDemo: boolean;
  /** Synthetic account of a backtest session: only the Backtest scope sees it. */
  isBacktest: boolean;
  startingBalance: string;
  journeyRootLogin: number;
};

export type ResolvedScope = {
  scope: Scope;
  /** Trades of these accounts, of this source, are in scope. Empty = nothing to show. */
  accountIds: string[];
  source: 'live' | 'backtest';
  accounts: ScopeAccount[];
  /** Demo and real money mixed: R is the default unit (§8.1). */
  mixedDemoAndReal: boolean;
  /** Accounts of different starting balances: offer the R toggle. */
  mixedSizes: boolean;
};

/**
 * Every live account with its journey root, for the scope selector and pickers; `includeBacktest` adds the
 * owner's backtest sessions' synthetic accounts (never an invited Backtest Lab user's).
 */
export async function listScopeAccounts(
  db: Executor,
  { includeBacktest = false }: { includeBacktest?: boolean } = {},
): Promise<ScopeAccount[]> {
  const rows = await db
    .select({
      id: accounts.id,
      login: accounts.login,
      phase: accounts.phase,
      status: accounts.status,
      isDemo: accounts.isDemo,
      isBacktest: accounts.isBacktest,
      startingBalance: accounts.startingBalance,
      journeyRootLogin: sql<number>`(
        select root.login from account_journeys j join accounts root on root.id = j.root_account_id
        where j.account_id = "accounts"."id"
      )`.mapWith(Number),
    })
    .from(accounts)
    .where(
      and(
        includeBacktest ? undefined : eq(accounts.isBacktest, false),
        sql`not exists (select 1 from backtest_sessions s where s.account_id = "accounts"."id" and s.owner_id is not null)`,
      ),
    )
    .orderBy(asc(accounts.firstSeenAt), asc(accounts.login));
  return rows.map((r) => ({ ...r, journeyRootLogin: r.journeyRootLogin || r.login }));
}

/**
 * Tracker spec §8.1: the one place a scope becomes account ids. Every tracker query goes through it.
 * A journey is named by the login of any account in it; the whole chain is returned.
 */
export async function resolveScope(db: Executor, scope: Scope = DEFAULT_SCOPE): Promise<ResolvedScope> {
  const every = await listScopeAccounts(db, { includeBacktest: true });
  // Backtest sessions' accounts belong to the Backtest scope only; live scopes never list them.
  const all = every.filter((a) => a.isBacktest === (scope.kind === 'backtest'));
  const byLogin = new Map(all.map((a) => [String(a.login), a]));
  let picked: ScopeAccount[];
  switch (scope.kind) {
    case 'all':
    case 'backtest':
      picked = all;
      break;
    case 'demo':
      picked = all.filter((a) => a.isDemo);
      break;
    case 'funded':
      picked = all.filter((a) => !a.isDemo);
      break;
    case 'account':
      picked = all.filter((a) => String(a.login) === scope.login);
      break;
    case 'accounts':
      picked = scope.logins.flatMap((l) => byLogin.get(l) ?? []);
      break;
    case 'journey': {
      const root = byLogin.get(scope.id)?.journeyRootLogin;
      picked = root === undefined ? [] : all.filter((a) => a.journeyRootLogin === root);
      break;
    }
  }
  return {
    scope,
    accountIds: picked.map((a) => a.id),
    source: scope.kind === 'backtest' ? 'backtest' : 'live',
    accounts: picked,
    mixedDemoAndReal: new Set(picked.map((a) => a.isDemo)).size > 1,
    mixedSizes: new Set(picked.map((a) => Number(a.startingBalance))).size > 1,
  };
}

/** Accounts by id, for labelling trades with `login · phase` (§8.1). */
export async function accountsById(db: Executor, ids: string[]) {
  if (ids.length === 0) return new Map<string, ScopeAccount>();
  const rows = await listScopeAccounts(db, { includeBacktest: true });
  const wanted = new Set(ids);
  return new Map(rows.filter((r) => wanted.has(r.id)).map((r) => [r.id, r]));
}
