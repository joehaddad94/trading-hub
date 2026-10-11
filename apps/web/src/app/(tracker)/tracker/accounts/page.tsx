import type { Route } from 'next';
import Link from 'next/link';
import { formatBeirut, formatMoney, formatPct } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StatusBadge } from '@/modules/tracker/components/account-badge';
import { AccountsTabs } from '@/modules/tracker/components/accounts-tabs';
import { Sparkline } from '@/modules/tracker/components/sparkline';
import { PHASE_LABELS } from '@/modules/tracker/scope-label';
import { getJourneys } from '@/modules/tracker/server/accounts';

const date = (d: Date | null) => (d ? formatBeirut(d, 'd MMM yyyy') : 'now');

export const metadata = { title: 'Accounts · Tracker' };

/** Accounts (§8.3 screen 2, §5.1): every account ever, grouped by journey P1 → P2 → Funded. */
export default async function AccountsPage() {
  const journeys = await getJourneys();
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Accounts</h2>
      <AccountsTabs current="list" />
      {!journeys ? (
        <p className="text-muted-foreground text-sm">Database not configured.</p>
      ) : journeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">No accounts yet. They appear after the first import.</p>
      ) : (
        journeys.map((j) => (
          <section
            key={j.rootLogin}
            aria-label={`Journey ${j.rootLogin}`}
            data-testid="journey"
            className="flex flex-col gap-2"
          >
            <h3 className="text-muted-foreground text-sm">
              {j.accounts.map((a) => PHASE_LABELS[a.phase] ?? a.phase).join(' → ')}
            </h3>
            <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {j.accounts.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/tracker/accounts/${a.login}` as Route}
                    className="flex flex-col gap-2 glass rounded-xl p-3 hover:bg-accent/40"
                    data-testid={`account-${a.login}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium num">
                        {a.login} · {PHASE_LABELS[a.phase] ?? a.phase}
                      </span>
                      <StatusBadge status={a.status} />
                    </div>
                    {a.statusReason && <p className="text-muted-foreground text-xs">{a.statusReason}</p>}
                    <Sparkline values={a.equity.map((p) => p.balance)} start={a.startingBalance} />
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-muted-foreground">Dates</dt>
                      <dd>
                        {date(a.startedAt)} → {date(a.endedAt)}
                      </dd>
                      <dt className="text-muted-foreground">Final balance</dt>
                      <dd className="num">{a.finalBalance ? formatMoney(a.finalBalance) : '—'}</dd>
                      <dt className="text-muted-foreground">Net P/L</dt>
                      <dd className={cn('num', a.stats.net.gt(0) && 'text-profit', a.stats.net.lt(0) && 'text-loss')}>
                        {formatMoney(a.stats.net)}
                      </dd>
                      <dt className="text-muted-foreground">Trades · win rate</dt>
                      <dd className="num">
                        {a.stats.trades} · {formatPct(a.stats.winRate)}
                      </dd>
                    </dl>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
