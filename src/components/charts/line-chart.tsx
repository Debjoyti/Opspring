"use client";

import { useState } from "react";

export type LinePoint = { label: string; value: number };

/**
 * Dependency-free responsive line chart with an optional dashed forecast tail.
 * Uses a viewBox + preserveAspectRatio="none" for width, with a fixed logical
 * height; hover shows the nearest point's value.
 */
export function LineChart({
  data,
  forecast = [],
  height = 200,
  format = (n) => String(n),
  valueLabel = "",
}: {
  data: LinePoint[];
  forecast?: LinePoint[];
  height?: number;
  format?: (n: number) => string;
  valueLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const all = [...data, ...forecast];
  if (all.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data</div>;
  }

  const W = 640;
  const H = height;
  const padX = 8;
  const padY = 16;
  const max = Math.max(...all.map((p) => p.value), 1);
  const min = Math.min(...all.map((p) => p.value), 0);
  const span = max - min || 1;
  const n = all.length;

  const x = (i: number) => padX + (i / Math.max(1, n - 1)) * (W - 2 * padX);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - 2 * padY);

  const actualPath = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const forecastStartIdx = data.length - 1;
  const forecastPath =
    forecast.length && data.length
      ? [
          `M${x(forecastStartIdx)},${y(data[forecastStartIdx].value)}`,
          ...forecast.map((p, i) => `L${x(forecastStartIdx + 1 + i)},${y(p.value)}`),
        ].join(" ")
      : "";

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none">
        {/* Area under actual */}
        <path
          d={`${actualPath} L${x(data.length - 1)},${H - padY} L${x(0)},${H - padY} Z`}
          className="fill-primary/10"
        />
        <path d={actualPath} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        {forecastPath && (
          <path
            d={forecastPath}
            className="fill-none stroke-primary/60"
            strokeWidth={2}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {all.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 4 : 2.5}
            className={i >= data.length ? "fill-primary/60" : "fill-primary"}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* Hover hit areas */}
        {all.map((p, i) => (
          <rect
            key={`h-${i}`}
            x={x(i) - (W / n) / 2}
            y={0}
            width={W / n}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-2 top-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm">
          <div className="font-medium">{all[hover].label}</div>
          <div className="text-muted-foreground">
            {format(all[hover].value)}
            {hover >= data.length ? " (forecast)" : ""} {valueLabel}
          </div>
        </div>
      )}
    </div>
  );
}
