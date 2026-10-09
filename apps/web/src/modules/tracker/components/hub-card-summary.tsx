import type { TrackerHubSummary } from '@trading/tracker/server';
import Decimal from 'decimal.js';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { accountLabel } from '../scope-label';

/** The live summary inside the hub's Tracker card (§8.0). */
export function TrackerHubCardSummary({ summary }: { summary: TrackerHubSummary | null }) {
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
        <dd className="text-foreground tabular-nums">{summary.awaitingJournal}</dd>
      </div>
      <div className="col-span-2">
        <dt>Active account</dt>
        <dd className="text-foreground tabular-nums">
          {first ? `${accountLabel(first)} · ${first.balance ? formatMoney(first.balance) : 'no balance yet'}` : 'None'}
          {rest.length > 0 && <span className="text-muted-foreground"> +{rest.length} more</span>}
        </dd>
      </div>
    </dl>
  );
}
