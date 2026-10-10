'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type CurvePoint = { i: number; label: string; equity: number; account: string };

/** Combined equity curve (§6) with account boundaries marked. Values are display-only numbers. */
export function EquityCurve({
  points,
  boundaries,
}: {
  points: CurvePoint[];
  boundaries: { i: number; account: string }[];
}) {
  if (points.length < 2) return <p className="text-muted-foreground text-sm">Not enough trades for a curve yet.</p>;
  return (
    <div className="h-64 w-full" data-testid="equity-curve">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeOpacity={0.1} vertical={false} />
          <XAxis dataKey="i" tick={false} stroke="currentColor" opacity={0.4} />
          <YAxis width={64} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as CurvePoint | undefined;
              return p ? `${p.label} · ${p.account}` : '';
            }}
            formatter={(v) => [typeof v === 'number' ? `$${v.toFixed(2)}` : v, 'Equity']}
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
