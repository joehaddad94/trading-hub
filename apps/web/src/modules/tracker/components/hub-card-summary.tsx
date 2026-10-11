import type { TrackerHubSummary } from '@trading/tracker/server';
import Decimal from 'decimal.js';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { accountLabel } from '../scope-label';

/** Room left before the active account's max-loss floor (decimal strings). */
export type HubMaxLoss = { room: string; limit: string };

/** The live summary inside the hub's Tracker card (§8.0), with max-loss room and a way into the journal (U7). */
export function TrackerHubCardSummary({
  summary,
  maxLoss,
}: {
  summary: TrackerHubSummary | null;
  maxLoss: HubMaxLoss | null;
}) {
  if (!summary?.hasData) return <span>No data yet.</span>;
  const net = new Decimal(summary.monthNet);
  const [first, ...rest] = summary.activeAccounts;
  return (
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2" data-testid="tracker-hub-summary">
      <div className="col-span-2">
        <dt>{summary.monthLabel}</dt>
        <dd
          className={cn(
            'font-semibold text-lg tabular-nums',
            net.gt(0) && 'text-emerald-500',
            net.lt(0) && 'text-red-500',
          )}
        >
          {formatMoney(net)}
        </dd>
      </div>
      <div>
        <dt>Green days</dt>
        <dd className="text-foreground tabular-nums">
          {summary.greenDays} / {summary.tradingDays}
        </dd>
      </div>
      <div>
        <dt>To journal</dt>
        <dd className="text-foreground tabular-nums">
          {summary.awaitingJournal > 0 ? (
            <Link
              href="/tracker/journal?view=quick"
              className="inline-flex min-h-11 items-center gap-1 underline-offset-4 hover:underline md:min-h-0"
              data-testid="hub-quick-journal"
            >
              {summary.awaitingJournal} · Journal now →
            </Link>
          ) : (
            'All done'
          )}
        </dd>
      </div>
      <div className="col-span-2">
        <dt>Active account</dt>
        <dd className="text-foreground tabular-nums">
          {first ? `${accountLabel(first)} · ${first.balance ? formatMoney(first.balance) : 'no balance yet'}` : 'None'}
          {rest.length > 0 && <span className="text-muted-foreground"> +{rest.length} more</span>}
        </dd>
      </div>
      {maxLoss && <MaxLossRoom {...maxLoss} />}
    </dl>
  );
}

function MaxLossRoom({ room, limit }: HubMaxLoss) {
  const left = Decimal.max(0, Decimal.min(1, new Decimal(room).div(limit)));
  const pct = left.times(100).toFixed(0);
  const tone = left.lte(0.2) ? 'bg-red-500' : left.lte(0.5) ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="col-span-2" data-testid="hub-max-loss">
      <dt className="flex justify-between">
        <span>Room to max loss</span>
        <span className="text-foreground tabular-nums">
          {formatMoney(room)} <span className="text-muted-foreground">of {formatMoney(limit)}</span>
        </span>
      </dt>
      <dd className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <span className="sr-only">{pct}% of the max-loss limit left</span>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </dd>
    </div>
  );
}
