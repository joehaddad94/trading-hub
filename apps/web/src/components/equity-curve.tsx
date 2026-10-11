'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { tradeAxisTicks } from '@/lib/chart-axis';
import { formatBeirut } from '@/lib/format';
import { ChartTooltip, chartMoney } from './chart-tooltip';

/** One point per closed trade: `t` is the close time (ms), `pnl` that trade's net result. */
export type CurvePoint = { i: number; t: number; equity: number; pnl: number; account: string };

/** Combined equity curve (§6) with account boundaries marked. Values are display-only numbers. */
export function EquityCurve({
  points,
  boundaries,
}: {
  points: CurvePoint[];
  boundaries: { i: number; account: string }[];
}) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Not enough trades for a curve yet.</p>;
  const axis = tradeAxisTicks(points.map((p) => p.t));
  const byI = new Map(points.map((p) => [p.i, p]));
  return (
    <div className="h-64 w-full" data-testid="equity-curve">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="i"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={axis.ticks.map((k) => points[k]?.i ?? 0)}
            tickFormatter={(i: number) => {
              const p = byI.get(i);
              return p ? formatBeirut(new Date(p.t), axis.pattern) : '';
            }}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
          />
          <YAxis width={64} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as CurvePoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltip
                  title={formatBeirut(new Date(p.t), 'EEE d MMM yyyy, HH:mm')}
                  rows={[
                    ['Equity', chartMoney(p.equity)],
                    ['Trade', chartMoney(p.pnl, true)],
                    ...(p.account ? [['Account', p.account] as [string, string]] : []),
                  ]}
                />
              );
            }}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          {boundaries.map((b) => (
            <ReferenceLine
              key={`${b.i}-${b.account}`}
              x={b.i}
              stroke="#f59e0b"
              strokeDasharray="3 3"
              strokeOpacity={0.6}
              label={{ value: b.account, position: 'insideTopLeft', fontSize: 10, fill: '#f59e0b' }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="equity"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
