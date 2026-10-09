import Decimal from 'decimal.js';

/** Tiny server-rendered equity line for account cards. */
export function Sparkline({ values, start }: { values: string[]; start: string }) {
  const series = [start, ...values].map((v) => new Decimal(v));
  if (series.length < 2) return <div className="h-10" aria-hidden />;
  const min = Decimal.min(...series);
  const max = Decimal.max(...series);
  const span = max.minus(min).isZero() ? new Decimal(1) : max.minus(min);
  const points = series
    .map(
      (v, i) =>
        `${((i / (series.length - 1)) * 100).toFixed(2)},${new Decimal(36).minus(v.minus(min).div(span).times(32)).toFixed(2)}`,
    )
    .join(' ');
  const up = (series.at(-1) as Decimal).gte(series[0] as Decimal);
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--profit)' : 'var(--loss)'}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
