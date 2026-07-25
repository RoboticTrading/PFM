"use client";

import { useState } from "react";

import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

function pnlClass(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-fg-muted";
}

/** signed % with a colour — the RoC/RoR cell. null → em-dash (undefined-risk structure). */
function Pct({ v }: { v: string | null }) {
  if (v == null) return <span className="text-fg-subtle">—</span>;
  const n = Number(v);
  return <span className={cn("tabular-nums", pnlClass(n))}>{n > 0 ? "+" : ""}{n}%</span>;
}

/**
 * The Strategy HUD — Bob's Excel by-strategy view, live: legs grouped into structures (Bull Put
 * Spread, Bear Call Spread, Iron Condor, Short Future) with the power columns he kept by hand —
 * Capital, MaxLoss, %RoC, %RoR. Left: the strategy scorecard. Right: the structure register,
 * filterable by clicking a strategy.
 */
export function StrategyHud() {
  const [strategy, setStrategy] = useState<string | null>(null);
  const strategies = trpc.cube.strategies.useQuery({});
  // reuse the trades filter shape: `instrumentType` is repurposed as the strategy filter in the lib.
  const structures = trpc.cube.structures.useQuery({
    ...(strategy ? { instrumentType: strategy } : {}),
    limit: 300,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
      {/* strategy scorecard */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            By strategy · P&amp;L · %RoC · capital
          </span>
          {strategy && (
            <button onClick={() => setStrategy(null)}
                    className="rounded bg-muted px-2 py-0.5 text-[11px] text-fg-muted hover:text-fg">
              {strategy} ✕
            </button>
          )}
        </div>
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wide text-fg-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-1.5 text-left font-medium">Strategy</th>
                <th className="py-1.5 text-right font-medium">n</th>
                <th className="py-1.5 text-right font-medium">Win</th>
                <th className="py-1.5 text-right font-medium">%RoC</th>
                <th className="px-4 py-1.5 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {(strategies.data ?? []).map((s) => {
                const v = Number(s.realizedPnl);
                return (
                  <tr key={s.strategy}
                      onClick={() => setStrategy(s.strategy === strategy ? null : s.strategy)}
                      className={cn(
                        "cursor-pointer border-b border-border-light/40 hover:bg-muted/50",
                        strategy === s.strategy && "bg-accent/10",
                      )}>
                    <td className="px-4 py-1.5 font-medium text-fg">{s.strategy}</td>
                    <td className="py-1.5 text-right text-xs text-fg-subtle tabular-nums">{s.n}</td>
                    <td className="py-1.5 text-right text-xs text-fg-subtle tabular-nums">
                      {Math.round(s.winRate * 100)}%
                    </td>
                    <td className="py-1.5 text-right text-xs"><Pct v={s.avgRoc} /></td>
                    <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", pnlClass(v))}>
                      {formatUsd(s.realizedPnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {strategies.isLoading && <p className="p-4 text-sm text-fg-muted">Loading…</p>}
        </div>
      </section>

      {/* structure register — the power columns */}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Structures {strategy ? `· ${strategy}` : ""} · Capital · MaxLoss · %RoC · %RoR
        </div>
        <div className="max-h-[34rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wide text-fg-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-1.5 text-left font-medium">Opened</th>
                <th className="py-1.5 text-left font-medium">Underlying</th>
                {!strategy && <th className="py-1.5 text-left font-medium">Strategy</th>}
                <th className="py-1.5 text-right font-medium">Held</th>
                <th className="py-1.5 text-right font-medium">Capital</th>
                <th className="py-1.5 text-right font-medium">MaxLoss</th>
                <th className="py-1.5 text-right font-medium">%RoC</th>
                <th className="py-1.5 text-right font-medium">%RoR</th>
                <th className="px-4 py-1.5 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {(structures.data ?? []).map((s) => {
                const v = Number(s.realizedPnl);
                return (
                  <tr key={s.structureId} className="border-b border-border-light/40 hover:bg-muted/40">
                    <td className="px-4 py-1.5 text-xs text-fg-muted">{s.openedAt?.slice(0, 10)}</td>
                    <td className="py-1.5 text-xs text-fg" title={`${s.source} · ${s.legs} legs`}>
                      {s.underlying}
                    </td>
                    {!strategy && <td className="py-1.5 text-xs text-fg-muted">{s.strategy}</td>}
                    <td className="py-1.5 text-right text-xs text-fg-subtle tabular-nums">
                      {s.heldDays == null ? "—" : `${s.heldDays}d`}
                    </td>
                    <td className="py-1.5 text-right text-xs text-fg-muted tabular-nums">
                      {s.capital == null ? "—" : formatUsd(s.capital)}
                    </td>
                    <td className="py-1.5 text-right text-xs text-fg-muted tabular-nums">
                      {s.maxLoss == null ? "—" : formatUsd(s.maxLoss)}
                    </td>
                    <td className="py-1.5 text-right text-xs"><Pct v={s.roc} /></td>
                    <td className="py-1.5 text-right text-xs"><Pct v={s.ror} /></td>
                    <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", pnlClass(v))}>
                      {formatUsd(s.realizedPnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {structures.isLoading && <p className="p-4 text-sm text-fg-muted">Loading…</p>}
          {structures.data && structures.data.length === 0 && (
            <p className="p-4 text-sm text-fg-muted">No structures.</p>
          )}
        </div>
      </section>
    </div>
  );
}
