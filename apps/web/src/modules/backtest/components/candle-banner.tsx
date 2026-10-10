import { formatBeirut } from '@/lib/format';
import { getCandleStatus } from '../server/market-data';

/** Backtest Lab: candle data problems (backtester spec §1.3). Amber: the lab still works on older data. */
export async function CandleBanner() {
  const status = await getCandleStatus();
  if (!status || status.conditions.length === 0) return null;
  return (
    <div role="alert" className="border-amber-500 border-b bg-amber-500/15 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl flex-col gap-1">
        <p className="font-semibold">Market data needs attention</p>
        <ul className="flex flex-col gap-0.5">
          {status.conditions.map((c) => (
            <li key={c.message} className="break-words">
              {c.message}
              {c.since && <span className="text-muted-foreground"> · {formatBeirut(c.since)}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Coverage per instrument: what replay can use. */
export async function CandleCoverage() {
  const status = await getCandleStatus();
  if (!status) return null;
  return (
    <section aria-labelledby="coverage-heading" className="flex flex-col gap-2">
      <h2 id="coverage-heading" className="font-semibold text-sm">
        Market data
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {status.coverage.map((c) => (
          <li key={c.code} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{c.displayName}</p>
            {c.count === 0 || !c.first || !c.last ? (
              <p className="text-muted-foreground">No candles yet — run the backfill.</p>
            ) : (
              <p className="text-muted-foreground">
                {c.count.toLocaleString('en-US')} 1m candles · {formatBeirut(c.first)} → {formatBeirut(c.last)}
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
