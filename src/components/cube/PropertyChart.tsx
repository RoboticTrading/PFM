"use client";

import { useMemo } from "react";

import type { PropertyDailyPoint } from "@/lib/cube/cube";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The house value-vs-basis chart — Bob's PayDayPlanner "BolivarDr" chart, live: the zEstimate/AVM
 * value line against the adjusted-cost-basis line (expenses inflate, rent deflates), with the equity
 * gap (diff) shaded between. Self-contained SVG, no chart dep. Fed by cube.property_daily.
 */
export function PropertyChart({ points }: { points: PropertyDailyPoint[] }) {
  const series = useMemo(() => points.filter((p) => p.value != null), [points]);

  if (series.length < 2) {
    return (
      <div className="flex h-[280px] items-center justify-center rounded-md border border-border bg-card text-sm text-fg-muted">
        Not enough history to chart.
      </div>
    );
  }

  const W = 1000;
  const H = 300;
  const pad = 8;
  const vals = series.map((p) => p.value as number);
  const costs = series.map((p) => p.adjustedCost);
  const minY = Math.min(...vals, ...costs);
  const maxY = Math.max(...vals, ...costs);
  const rangeY = maxY - minY || 1;
  const x = (i: number) => pad + (i / (series.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - minY) / rangeY) * (H - 2 * pad);

  const path = (get: (p: PropertyDailyPoint) => number) =>
    series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(get(p)).toFixed(1)}`).join(" ");
  const valLine = path((p) => p.value as number);
  const costLine = path((p) => p.adjustedCost);
  // equity band = area between value and cost
  const band =
    series.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value as number).toFixed(1)}`).join(" ") +
    " " +
    series
      .map((p, i) => `L${x(series.length - 1 - i).toFixed(1)},${y(series[series.length - 1 - i].adjustedCost).toFixed(1)}`)
      .join(" ") +
    " Z";

  const lastVal = vals[vals.length - 1];
  const lastCost = costs[costs.length - 1];
  const lastDiff = lastVal - lastCost;
  const up = lastDiff >= 0;

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Value vs adjusted cost · equity shaded
        </span>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1 text-fg-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-accent)" }} /> value{" "}
            <span className="font-semibold text-fg tabular-nums">{formatUsd(String(lastVal))}</span>
          </span>
          <span className="flex items-center gap-1 text-fg-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: "var(--color-danger)" }} /> cost{" "}
            <span className="font-semibold text-fg tabular-nums">{formatUsd(String(lastCost))}</span>
          </span>
          <span className={cn("font-semibold tabular-nums", up ? "text-success" : "text-danger")}>
            equity {formatUsd(String(Math.round(lastDiff)))}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 260 }}>
        <path d={band} fill="var(--color-success)" fillOpacity="0.12" />
        <path d={costLine} fill="none" stroke="var(--color-danger)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <path d={valLine} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span>{series[0].d}</span>
        <span>peak value {formatUsd(String(maxY))}</span>
        <span>{series[series.length - 1].d}</span>
      </div>
    </div>
  );
}
