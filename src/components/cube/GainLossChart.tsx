"use client";

import { useMemo, useState } from "react";

import type { EtfDailyPoint } from "@/lib/cube/cube";
import { formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

type Mode = "dollar" | "pct";

/** Least-squares linear trend over y[i] vs i → endpoints for the regression line. */
function trendline(ys: number[]): [number, number] {
  const n = ys.length;
  if (n < 2) return [ys[0] ?? 0, ys[0] ?? 0];
  const sx = ((n - 1) * n) / 2;
  const sxx = ((n - 1) * n * (2 * n - 1)) / 6;
  let sy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sy += ys[i];
    sxy += i * ys[i];
  }
  const denom = n * sxx - sx * sx || 1;
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;
  return [intercept, intercept + slope * (n - 1)];
}

/**
 * Bob's ETF gain/loss chart, reproduced live — the daily $ or % Gain/Loss curve with its linear
 * trend line, exactly like the QYLD.xlsm charts, but fed by the Cube (broker candles + the buy/dividend
 * footprints) so it never rots like the old Yahoo-VBA sheet did. Self-contained SVG, no chart dep.
 */
export function GainLossChart({ symbol, points }: { symbol: string; points: EtfDailyPoint[] }) {
  const [mode, setMode] = useState<Mode>("dollar");

  const view = useMemo(() => {
    const ys = points.map((p) => (mode === "dollar" ? p.gain : p.gainPct));
    const [t0, t1] = trendline(ys);
    return { ys, t0, t1 };
  }, [points, mode]);

  if (points.length < 2) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-md border border-border bg-card text-sm text-fg-muted">
        No daily series for {symbol} yet.
      </div>
    );
  }

  const W = 1000;
  const H = 300;
  const pad = 8;
  const { ys, t0, t1 } = view;
  const minY = Math.min(0, ...ys, t0, t1);
  const maxY = Math.max(0, ...ys, t0, t1);
  const rangeY = maxY - minY || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - minY) / rangeY) * (H - 2 * pad);

  const line = ys.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(minY).toFixed(1)} L${x(0).toFixed(1)},${y(minY).toFixed(1)} Z`;
  const last = ys[ys.length - 1];
  const up = last >= 0;
  const stroke = up ? "var(--color-success)" : "var(--color-danger)";
  const fmt = (v: number) => (mode === "dollar" ? formatUsd(String(Math.round(v))) : `${v.toFixed(1)}%`);

  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-sm font-semibold text-accent">{symbol}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            {mode === "dollar" ? "$ Gain/Loss" : "% Gain/Loss"} · vs net basis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-base font-semibold tabular-nums", up ? "text-success" : "text-danger")}>
            {fmt(last)}
          </span>
          <div className="flex overflow-hidden rounded-md border border-border-light text-[11px]">
            {(["dollar", "pct"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2 py-0.5 transition-colors",
                  mode === m ? "bg-accent/15 text-accent" : "text-fg-muted hover:bg-muted",
                )}
              >
                {m === "dollar" ? "$" : "%"}
              </button>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 260 }}>
        <defs>
          <linearGradient id={`gl-${symbol}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {maxY > 0 && minY < 0 && (
          <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-border-light)" strokeWidth="1" strokeDasharray="3 3" />
        )}
        <path d={area} fill={`url(#gl-${symbol})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        {/* linear trend line */}
        <line
          x1={x(0)} y1={y(t0)} x2={x(points.length - 1)} y2={y(t1)}
          stroke="var(--color-accent)" strokeWidth="1.25" strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke" opacity="0.85"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span>{points[0].d}</span>
        <span>peak {fmt(Math.max(...ys))} · trough {fmt(Math.min(...ys))}</span>
        <span>{points[points.length - 1].d}</span>
      </div>
    </div>
  );
}
