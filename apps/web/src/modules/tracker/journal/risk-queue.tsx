'use client';

import { riskUsdFromPct } from '@trading/core';
import Decimal from 'decimal.js';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/action-result';
import { formatBeirut, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatR } from '../calendar/format';
import { RISK_PCT_CHOICES, type RiskTagInput } from './schema';

export type RiskQueueItem = {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  lots: string;
  closedAt: Date;
  netProfit: string;
  startingBalance: string;
  account: string;
};

/**
 * One card per trade whose R is an estimate: tap the % you risked and it leaves the queue. Mobile-first, so the
 * whole backlog takes a couple of minutes on a phone.
 */
export function RiskQueue({
  items,
  total,
  tag,
}: {
  items: RiskQueueItem[];
  total: number;
  tag: (input: RiskTagInput) => Promise<ActionResult<null>>;
}) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const left = items.filter((t) => !done.has(t.id));
  // `total` comes from the server and drops once a refresh lands, so only subtract tags it doesn't reflect yet.
  const remaining = Math.max(total - items.filter((t) => done.has(t.id)).length, 0);

  const submit = (tradeId: string, pct: string) => {
    setError(null);
    startTransition(async () => {
      const res = await tag({ tradeId, pct });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone((d) => new Set(d).add(tradeId));
      router.refresh();
    });
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Risk queue">
      <p className="text-muted-foreground text-sm" data-testid="risk-queue-count">
        {remaining} {remaining === 1 ? 'trade has' : 'trades have'} an estimated R. Tap the % of the starting balance
        you risked on each.
        {done.size > 0 && <span className="text-profit"> {done.size} tagged.</span>}
      </p>
      {error && (
        <p role="alert" className="text-loss text-sm">
          {error}
        </p>
      )}
      {left.length === 0 ? (
        <p className="text-muted-foreground text-sm">Every trade in scope has a real risk.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2" data-testid="risk-queue">
          {left.map((t) => (
            <RiskCard key={t.id} trade={t} disabled={pending} onPick={(pct) => submit(t.id, pct)} />
          ))}
        </ul>
      )}
      {total > items.length && <p className="text-muted-foreground text-xs">Showing the newest {items.length}.</p>}
    </section>
  );
}

function RiskCard({
  trade: t,
  disabled,
  onPick,
}: {
  trade: RiskQueueItem;
  disabled: boolean;
  onPick: (pct: string) => void;
}) {
  const [other, setOther] = useState('');
  const net = new Decimal(t.netProfit);
  const rAt = (pct: string) => formatR(net.div(riskUsdFromPct(t.startingBalance, pct)));
  return (
    <li className="flex flex-col gap-2 glass rounded-xl p-3 text-sm" data-testid="risk-card">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/tracker/trades/${t.id}` as Route} className="min-w-0 hover:underline">
          <span className="font-medium">
            {t.symbol} <span className="capitalize">{t.side}</span> · {t.lots}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {t.account} · {formatBeirut(t.closedAt, 'd MMM HH:mm')}
          </span>
        </Link>
        <span className={cn('font-semibold num', net.gt(0) && 'text-profit', net.lt(0) && 'text-loss')}>
          {formatMoney(t.netProfit)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {RISK_PCT_CHOICES.map((pct) => (
          <button
            key={pct}
            type="button"
            disabled={disabled}
            onClick={() => onPick(pct)}
            title={`${formatMoney(riskUsdFromPct(t.startingBalance, pct))} risked → ${rAt(pct)}`}
            className="h-11 rounded-full border px-3 num hover:bg-accent disabled:opacity-50 md:h-8"
          >
            {pct}%
          </button>
        ))}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (other.trim()) onPick(other.trim());
          }}
        >
          <Input
            aria-label={`Other risk % for ${t.symbol}`}
            inputMode="decimal"
            placeholder="Other %"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className="h-11 w-24 md:h-8"
          />
          <Button type="submit" variant="outline" disabled={disabled || !other.trim()} className="h-11 md:h-8">
            Set
          </Button>
        </form>
      </div>
    </li>
  );
}
