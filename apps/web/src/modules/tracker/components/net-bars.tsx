'use client';

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, chartMoney } from '@/components/chart-tooltip';

export type NetBar = { label: string; net: number; trades: number };

/** Net P/L per group as bars (audit U13), so the strongest hours, weekdays and hold times stand out. */
export function NetBars({ bars, testId }: { bars: NetBar[]; testId: string }) {
  if (bars.length === 0) return null;
  return (
    <div className="h-44 w-full" data-testid={testId}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            interval={bars.length <= 8 ? 0 : 'preserveStartEnd'}
            stroke="currentColor"
            opacity={0.5}
          />
          <YAxis width={56} tick={{ fontSize: 11 }} stroke="currentColor" opacity={0.5} />
          <ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.3} />
          <Tooltip
            cursor={{ fillOpacity: 0.05 }}
            content={({ active, payload }) => {
              const b = payload?.[0]?.payload as NetBar | undefined;
              if (!active || !b) return null;
              return (
                <ChartTooltip
                  title={b.label}
                  rows={[
                    ['Net', chartMoney(b.net)],
                    ['Trades', String(b.trades)],
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="net" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {bars.map((b) => (
              <Cell key={b.label} fill={b.net >= 0 ? 'var(--profit)' : 'var(--loss)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
