'use client';

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Account balance after each trade, with the starting balance and max-loss floor marked. Display-only numbers. */
export function BalanceCurve({
  points,
  start,
  floor,
}: {
  points: { label: string; balance: number }[];
  start: number;
  floor: number | null;
}) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Not enough trades for a curve yet.</p>;
  return (
    <div className="h-56 w-full" data-testid="balance-curve">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={false} stroke="currentColor" opacity={0.4} />
          <YAxis width={64} domain={['auto', 'auto']} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }}
            formatter={(v) => [typeof v === 'number' ? `$${v.toFixed(2)}` : v, 'Balance']}
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
