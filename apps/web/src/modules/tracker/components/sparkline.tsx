import Decimal from 'decimal.js';

/**
 * Tiny server-rendered equity line for account cards. `area` draws the hub style: accent line over a
 * gradient fill with the end point marked (design spec); `gradientId` must be unique on the page.
 */
export function Sparkline({
  values,
  start,
  area,
  className = 'h-10 w-full',
}: {
  values: string[];
  start: string;
  area?: { gradientId: string } | undefined;
  className?: string;
}) {
  const series = [start, ...values].map((v) => new Decimal(v));
  if (series.length < 2) return <div className={className} aria-hidden />;
  const min = Decimal.min(...series);
  const max = Decimal.max(...series);
  const span = max.minus(min).isZero() ? new Decimal(1) : max.minus(min);
  const xy = series.map((v, i) => ({
    x: ((i / (series.length - 1)) * 100).toFixed(2),
    y: new Decimal(36).minus(v.minus(min).div(span).times(32)).toFixed(2),
  }));
  const points = xy.map((p) => `${p.x},${p.y}`).join(' ');
  const up = (series.at(-1) as Decimal).gte(series[0] as Decimal);
  if (!area) {
    return (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
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
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={area.gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.4" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[10, 20, 30].map((y) => (
        <line
          key={y}
          x1="0"
          x2="100"
          y1={y}
          y2={y}
          stroke="white"
          strokeOpacity="0.06"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polygon points={`0,40 ${points} 100,40`} fill={`url(#${area.gradientId})`} />
      <polyline
        points={points}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
