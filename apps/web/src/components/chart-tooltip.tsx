/** Shared tooltip body for the Recharts curves: a title line and label/value rows. */
export function ChartTooltip({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Dollar label for chart values (already display numbers from Decimal.toNumber(); never used for maths). */
export function chartMoney(v: number, signed = false): string {
  const abs = `$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v < 0) return `-${abs}`;
  return signed ? `+${abs}` : abs;
}
