"use client";

export type BarDatum = { label: string; value: number; highlight?: boolean };

/** Simple vertical bar chart (dependency-free), for appointment volume etc. */
export function BarChart({
  data,
  height = 160,
  format = (n) => String(n),
}: {
  data: BarDatum[];
  height?: number;
  format?: (n: number) => string;
}) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="group flex flex-1 flex-col items-center justify-end">
          <div className="mb-1 hidden text-[10px] text-muted-foreground group-hover:block">{format(d.value)}</div>
          <div
            className={d.highlight ? "w-full rounded-t bg-primary" : "w-full rounded-t bg-primary/60"}
            style={{ height: `${Math.max(2, (d.value / max) * (height - 24))}px` }}
            title={`${d.label}: ${format(d.value)}`}
          />
          <div className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
