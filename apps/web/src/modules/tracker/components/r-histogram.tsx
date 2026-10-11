'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export type HistogramBin = { label: string; count: number; from: number | null };

/** R-multiple distribution (§8.3 screen 7): half-R bars, losses red, wins green. */
export function RHistogram({ bins }: { bins: HistogramBin[] }) {
  return (
    <div className="h-56 w-full" data-testid="r-histogram">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} stroke="currentColor" opacity={0.5} />
          <YAxis width={32} allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <Tooltip
            cursor={{ fillOpacity: 0.05 }}
            contentStyle={{
              background: 'var(--popover)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v) => [v, 'Trades']}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {bins.map((b) => (
              <Cell key={b.label} fill={b.from !== null && b.from >= 0 ? 'var(--profit)' : 'var(--loss)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
