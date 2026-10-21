import { formatBeirut } from '@/lib/format';
import { StatusStrip } from '@/shell/status-strip';
import { getCandleCoverage, getCandleHealth } from '../server/market-data';

/** Backtest Lab: candle data problems (backtester spec §1.3). Amber: the lab still works on older data. */
export async function CandleBanner() {
  const conditions = await getCandleHealth();
  if (!conditions || conditions.length === 0) return null;
  return (
    <StatusStrip
      tone="warning"
      title="Market data needs attention"
      items={conditions.map((c) => ({ key: c.message, message: c.message, since: c.since }))}
    />
  );
}

/** Coverage per instrument: what replay can use. */
export async function CandleCoverage() {
  const coverage = await getCandleCoverage();
  if (!coverage) return null;
  return (
    <section aria-labelledby="coverage-heading" className="flex flex-col gap-2">
      <h2 id="coverage-heading" className="font-semibold text-sm">
        Market data
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {coverage.map((c) => (
          <li key={c.code} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{c.displayName}</p>
            {!c.first || !c.last ? (
              <p className="text-muted-foreground">No candles yet — run the backfill.</p>
            ) : (
              <p className="text-muted-foreground">
                1m candles · {formatBeirut(c.first)} → {formatBeirut(c.last)}
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">
        Historical data from Dukascopy; prices may differ slightly from your broker.
      </p>
    </section>
  );
}
