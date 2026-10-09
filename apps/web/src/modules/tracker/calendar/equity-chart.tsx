'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type EquitySeries = { key: string; label: string; colour: string };
export type EquityPoint = { time: string } & Record<string, number | string | null>;

/** Intraday equity curve for the day view (§8.2): cumulative closed P/L per account and combined. */
export function EquityChart({ points, series }: { points: EquityPoint[]; series: EquitySeries[] }) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Needs two or more trades.</p>;
  return (
    <div className="h-48 w-full" data-testid="day-equity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" opacity={0.5} />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }}
            formatter={(v) => (typeof v === 'number' ? `$${v.toFixed(2)}` : v)}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="stepAfter"
              dataKey={s.key}
              name={s.label}
              stroke={s.colour}
              strokeWidth={s.key === 'combined' ? 2.5 : 1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
