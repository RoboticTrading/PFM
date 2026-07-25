"use client";

import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Cumulative realized-P&L curve — Bob's Excel "waterfall" as a live chart. Self-contained SVG
 * (no chart dep): filled area to the zero line, colored by whether the book is up or down.
 */
export function EquityCurve({ points }: { points: { date: string; cum: number }[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-[210px] items-center justify-center rounded-md border border-border bg-card text-sm text-fg-muted">
        Not enough closed trades to chart.
      </div>
    );
  }

  const W = 1000;
  const H = 200;
  const pad = 6;
  const ys = points.map((p) => p.cum);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(0, ...ys);
  const rangeY = maxY - minY || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - minY) / rangeY) * (H - 2 * pad);

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.cum).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(minY).toFixed(1)} L${x(0).toFixed(1)},${y(minY).toFixed(1)} Z`;
  const last = ys[ys.length - 1];
  const up = last >= 0;
  const stroke = up ? "var(--color-success)" : "var(--color-danger)";

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Cumulative realized P&L · {points.length} days
        </span>
        <span className={cn("text-base font-semibold tabular-nums", up ? "text-success" : "text-danger")}>
          {formatUsd(String(last))}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 190 }}>
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-border-light)" strokeWidth="1" strokeDasharray="3 3" />
        <path d={area} fill="url(#eqfill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span>{points[0].date}</span>
        <span>peak {formatUsd(String(maxY))} · trough {formatUsd(String(minY))}</span>
        <span>{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}
