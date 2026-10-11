'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, chartMoney } from '@/components/chart-tooltip';
import { formatBeirut } from '@/lib/format';

export type EquitySeries = { key: string; label: string; colour: string };
/** `t` is the close time in ms (the first point is the day's first open); `trade` describes that close. */
export type EquityPoint = { t: number; trade: string } & Record<string, number | string | null>;

const clock = (t: number) => formatBeirut(new Date(t), 'HH:mm');

/** Intraday equity curve for the day view (§8.2): cumulative closed P/L per account and combined, on a clock axis. */
export function EquityChart({ points, series }: { points: EquityPoint[]; series: EquitySeries[] }) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Needs two or more trades.</p>;
  return (
    <div className="h-48 w-full" data-testid="day-equity">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={clock}
            tickCount={6}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
          />
          <YAxis tick={{ fontSize: 11 }} width={56} stroke="currentColor" opacity={0.5} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as EquityPoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltip
                  title={`${clock(p.t)} · ${p.trade}`}
                  rows={series.map((s) => [s.label, chartMoney(Number(p[s.key] ?? 0))])}
                />
              );
            }}
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
