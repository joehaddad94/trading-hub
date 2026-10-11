'use client';

import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/** Cumulative net prop result after each cashflow (§8.3 screen 9). Display-only numbers. */
export function NetCurve({ points }: { points: { label: string; net: number }[] }) {
  if (points.length < 2) return null;
  return (
    <div className="h-48 w-full" data-testid="net-curve">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <YAxis width={64} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [typeof v === 'number' ? `$${v.toFixed(2)}` : v, 'Net']}
          />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} strokeDasharray="4 4" />
          <Line
            type="stepAfter"
            dataKey="net"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--primary)' }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
