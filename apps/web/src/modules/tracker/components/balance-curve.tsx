'use client';

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, chartMoney } from '@/components/chart-tooltip';
import { tradeAxisTicks } from '@/lib/chart-axis';
import { formatBeirut } from '@/lib/format';

/** One point per closed trade: `t` is the close time (ms), `pnl` that trade's net result. */
export type BalancePoint = { t: number; balance: number; pnl: number };

/** Account balance after each trade, with the starting balance and max-loss floor marked. Display-only numbers. */
export function BalanceCurve({
  points,
  start,
  floor,
}: {
  points: BalancePoint[];
  start: number;
  floor: number | null;
}) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Not enough trades for a curve yet.</p>;
  const data = points.map((p, i) => ({ ...p, i }));
  const axis = tradeAxisTicks(points.map((p) => p.t));
  return (
    <div className="h-56 w-full" data-testid="balance-curve">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="i"
            type="number"
            domain={['dataMin', 'dataMax']}
            ticks={axis.ticks}
            tickFormatter={(i: number) => {
              const p = points[i];
              return p ? formatBeirut(new Date(p.t), axis.pattern) : '';
            }}
            tick={{ fontSize: 11 }}
            stroke="currentColor"
            opacity={0.5}
          />
          <YAxis width={64} domain={['auto', 'auto']} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as BalancePoint | undefined;
              if (!active || !p) return null;
              return (
                <ChartTooltip
                  title={formatBeirut(new Date(p.t), 'EEE d MMM yyyy, HH:mm')}
                  rows={[
                    ['Balance', chartMoney(p.balance)],
                    ['Trade', chartMoney(p.pnl, true)],
                  ]}
                />
              );
            }}
          />
          <ReferenceLine y={start} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
          {floor !== null && (
            <ReferenceLine
              y={floor}
              stroke="var(--loss)"
              strokeDasharray="4 4"
              label={{ value: 'Max loss', position: 'insideBottomLeft', fontSize: 10, fill: 'var(--loss)' }}
            />
          )}
          <Line
            type="monotone"
            dataKey="balance"
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
