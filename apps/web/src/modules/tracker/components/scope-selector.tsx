'use client';

import { parseScope, serializeScope } from '@trading/core';
import { useQueryStates } from 'nuqs';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { accountLabel, journeys, type ScopeOption, scopeLabel } from '../scope-label';
import { trackerSearchParams } from '../search-params';

const STORAGE_KEY = 'tracker.scope';

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode or blocked storage: the URL still carries the scope.
  }
}

/** Tracker header control (spec §8.1). The URL is the source of truth; localStorage is only a fallback. */
export function ScopeSelector({ accounts }: { accounts: ScopeOption[] }) {
  const id = useId();
  const [{ scope: raw }, setParams] = useQueryStates(trackerSearchParams);
  const scope = parseScope(raw);
  const value = serializeScope(scope);
  const [custom, setCustom] = useState(scope.kind === 'accounts');
  const chains = journeys(accounts);

  useEffect(() => {
    const url = new URL(window.location.href);
    const stored = readStored();
    if (!url.searchParams.has('scope') && stored && stored !== 'all') {
      void setParams({ scope: serializeScope(parseScope(stored)) }, { history: 'replace' });
    }
  }, [setParams]);

  const choose = (next: string) => {
    store(next);
    void setParams({ scope: next === 'all' ? null : next });
  };

  const selected = scope.kind === 'accounts' ? scope.logins : scope.kind === 'account' ? [scope.login] : [];
  const toggle = (login: string) => {
    const logins = selected.includes(login) ? selected.filter((l) => l !== login) : [...selected, login];
    choose(logins.length ? serializeScope(parseScope(`accounts:${logins.join(',')}`)) : 'all');
  };

  return (
    <div className="relative flex min-w-0 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Account scope
      </label>
      <select
        id={id}
        data-testid="scope-selector"
        className="h-10 w-full min-w-0 max-w-44 truncate rounded-md border bg-background px-2 text-sm md:h-9 md:max-w-60"
        value={custom ? 'custom' : value}
        onChange={(e) => {
          if (e.target.value === 'custom') {
            setCustom(true);
            return;
          }
          setCustom(false);
          choose(e.target.value);
        }}
      >
        <option value="all">All live accounts</option>
        <option value="demo">Demo only</option>
        <option value="funded">Funded only</option>
        {accounts.length > 0 && (
          <optgroup label="Account">
            {accounts.map((a) => (
              <option key={a.login} value={`account:${a.login}`}>
                {accountLabel(a)} ({a.status})
              </option>
            ))}
          </optgroup>
        )}
        {chains.length > 0 && (
          <optgroup label="Journey">
            {chains.map(([root, chain]) => (
              <option key={root} value={`journey:${root}`}>
                {chain.map((a) => accountLabel(a)).join(' → ')}
              </option>
            ))}
          </optgroup>
        )}
        <option value="custom">Custom…</option>
        <option value="backtest">Backtest</option>
        {/* A scope from a shared link that matches no option above still shows its label. */}
        {!custom &&
          !['all', 'demo', 'funded', 'backtest'].includes(value) &&
          !accounts.some((a) => `account:${a.login}` === value) &&
          !chains.some(([root]) => `journey:${root}` === value) && (
            <option value={value}>{scopeLabel(scope, accounts)}</option>
          )}
      </select>
      {custom && (
        <fieldset className="absolute top-12 right-0 z-30 flex min-w-56 flex-col gap-1 rounded-md border bg-popover p-2 shadow-md">
          <legend className="sr-only">Pick accounts</legend>
          {accounts.map((a) => (
            <label key={a.login} className="flex h-11 items-center gap-2 px-2 text-sm md:h-9">
              <input
                type="checkbox"
                checked={selected.includes(String(a.login))}
                onChange={() => toggle(String(a.login))}
              />
              {accountLabel(a)}
            </label>
          ))}
          {accounts.length === 0 && <p className="px-2 text-muted-foreground text-sm">No accounts yet.</p>}
          <Button size="sm" variant="secondary" onClick={() => setCustom(false)}>
            Done
          </Button>
        </fieldset>
      )}
    </div>
  );
}
