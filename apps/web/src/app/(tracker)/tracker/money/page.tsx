import type { CashflowKind } from '@trading/core';
import Decimal from 'decimal.js';
import type { SearchParams } from 'nuqs/server';
import { ActionForm } from '@/components/action-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NetCurve } from '@/modules/tracker/components/net-curve';
import { accountLabel } from '@/modules/tracker/scope-label';
import { getCashflowAccounts, getMoney } from '@/modules/tracker/server/money';
import { getPageScope } from '@/modules/tracker/server/scope';
import { addCashflowAction, deleteCashflowAction } from './actions';

const KIND_LABELS: Record<CashflowKind, string> = {
  challenge_fee: 'Challenge fee',
  reset_fee: 'Reset fee',
  addon: 'Add-on',
  payout: 'Payout',
  refund: 'Refund',
  other: 'Other cost',
};

const tone = (v: { gt(n: number): boolean; lt(n: number): boolean }) =>
  v.gt(0) ? 'text-profit' : v.lt(0) ? 'text-loss' : undefined;

export const metadata = { title: 'Money · Tracker' };

/** Money (§8.3 screen 9): fees, resets and payouts with the running net prop result. */
export default async function MoneyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const scope = await getPageScope(searchParams);
  if (!scope) return <p className="p-4 text-muted-foreground text-sm md:p-6">Database not configured.</p>;
  const [data, accounts] = await Promise.all([getMoney(scope), getCashflowAccounts()]);
  if (!data) return null;
  const { summary, rows } = data;
  const costs = (['challenge_fee', 'reset_fee', 'addon', 'refund', 'other'] as const).filter(
    (k) => !summary.byKind[k].isZero(),
  );
  // Rows and the timeline share the same oldest-first order, so the running net lines up by index.
  const newest = rows.map((r, i) => ({ r, net: summary.timeline[i]?.cumulative })).reverse();

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6">
      <h2 className="font-semibold text-xl">Money</h2>
      {!data.firmLevel && (
        <p className="text-muted-foreground text-sm">
          Showing cashflows of the accounts in scope. Switch to all accounts for the full net prop result.
        </p>
      )}

      <dl className="grid grid-cols-3 gap-2" data-testid="money-summary">
        {(
          [
            ['Net prop result', summary.net, tone(summary.net)],
            ['Payouts', summary.payouts, summary.payouts.gt(0) ? 'text-profit' : undefined],
            ['Fees', summary.fees, summary.fees.gt(0) ? 'text-loss' : undefined],
          ] as const
        ).map(([label, value, cls]) => (
          <div key={label} className="glass rounded-xl p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className={cn('font-semibold text-lg num', cls)}>{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      {costs.length > 0 && (
        <p className="text-muted-foreground text-sm" data-testid="money-breakdown">
          {costs.map((k) => `${KIND_LABELS[k]} ${formatMoney(summary.byKind[k])}`).join(' · ')}
        </p>
      )}

      <NetCurve
        points={summary.timeline.map((t) => ({
          label: formatBeirut(t.at, 'd MMM yy'),
          net: t.cumulative.toNumber(),
        }))}
      />

      <section className="flex flex-col gap-2">
        <h3 className="font-medium">Timeline</h3>
        {newest.length === 0 ? (
          <p className="text-muted-foreground text-sm">No fees or payouts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="cashflows">
            {newest.map(({ r, net }) => {
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {KIND_LABELS[r.kind]}
                      {r.manual && (
                        <span className="ml-2 rounded bg-muted px-1 font-normal text-muted-foreground text-xs">
                          manual
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {formatBeirut(r.occurredAt, 'd MMM yyyy')}
                      {r.account ? ` · ${accountLabel(r.account)}` : ''}
                      {r.listPrice && r.discount
                        ? ` · list ${formatMoney(r.listPrice)}, discount ${formatMoney(r.discount)}`
                        : ''}
                      {r.note ? ` · ${r.note}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={cn('font-semibold num', tone(new Decimal(r.amountUsd)))}>
                        {formatMoney(r.amountUsd)}
                      </p>
                      {net && <p className="text-muted-foreground text-xs num">net {formatMoney(net)}</p>}
                    </div>
                    {r.manual && (
                      <ActionForm
                        action={deleteCashflowAction}
                        submit="Delete"
                        label={`Delete ${KIND_LABELS[r.kind]} of ${formatBeirut(r.occurredAt, 'd MMM yyyy')}`}
                      >
                        <input type="hidden" name="id" value={r.id} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="glass rounded-xl p-4">
        <h3 className="mb-1 font-medium">Add a fee or payout</h3>
        <p className="mb-3 text-muted-foreground text-xs">
          For money the exports don&apos;t carry yet (payouts are kept raw until their shape is verified). Enter the
          amount as a positive number; fees are counted as costs.
        </p>
        <ActionForm action={addCashflowAction} submit="Add" label="Add cashflow">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="cf-kind">Type</Label>
              <select
                id="cf-kind"
                name="kind"
                className="h-11 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm"
              >
                {(Object.keys(KIND_LABELS) as CashflowKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cf-amount">Amount $</Label>
              <Input id="cf-amount" name="amount" inputMode="decimal" autoComplete="off" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cf-date">Date</Label>
              <Input id="cf-date" name="date" type="date" defaultValue={formatBeirut(new Date(), 'yyyy-MM-dd')} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="cf-account">Account</Label>
              <select
                id="cf-account"
                name="accountId"
                className="h-11 rounded-md border bg-background px-2 text-base md:h-9 md:text-sm"
              >
                <option value="">No specific account</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="cf-note">Note</Label>
            <Input id="cf-note" name="note" maxLength={200} />
          </div>
        </ActionForm>
      </section>
    </div>
  );
}
