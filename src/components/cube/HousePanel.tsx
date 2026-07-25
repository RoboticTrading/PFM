"use client";

import { useEffect, useState } from "react";

import { PropertyChart } from "@/components/cube/PropertyChart";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

function pnlClass(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-fg-muted";
}

/**
 * Tracked hard assets — real estate + vehicles — as marked-to-market positions (Bob's BolivarDr model
 * generalized). Each: current value vs adjusted cost vs diff. For the house diff = equity; for a car
 * (depreciating, no rent) diff = true cost of ownership (value − everything sunk in). Pick an asset to
 * see its value-vs-cost chart and basis footprints.
 */
export function HousePanel() {
  const properties = trpc.cube.properties.useQuery();
  const [key, setKey] = useState<string | null>(null);

  const list = properties.data ?? [];
  const selected = list.find((p) => p.propertyKey === key) ?? list[0];
  useEffect(() => {
    if (!key && list[0]) setKey(list[0].propertyKey);
  }, [key, list]);

  const daily = trpc.cube.propertyDaily.useQuery(
    { propertyKey: selected?.propertyKey ?? "" },
    { enabled: !!selected },
  );
  const ledger = trpc.cube.propertyLedger.useQuery(
    { propertyKey: selected?.propertyKey ?? "" },
    { enabled: !!selected },
  );

  if (properties.data && properties.data.length === 0) {
    return (
      <section className="mt-4 rounded-md border border-border bg-card px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Hard assets</div>
        <p className="mt-1 text-sm text-fg-muted">No assets configured yet.</p>
      </section>
    );
  }
  if (!selected) return null;

  const isVehicle = selected.kind === "vehicle";
  const value = selected.value == null ? null : Number(selected.value);
  const cost = selected.adjustedCost == null ? null : Number(selected.adjustedCost);
  const diff = selected.diff == null ? null : Number(selected.diff);

  return (
    <section className="mt-4">
      {/* asset selector — one chip per tracked asset */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Hard assets</span>
        {list.map((p) => {
          const d = p.diff == null ? null : Number(p.diff);
          return (
            <button
              key={p.propertyKey}
              onClick={() => setKey(p.propertyKey)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1 text-xs transition-colors",
                p.propertyKey === selected.propertyKey
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-fg-muted hover:bg-muted",
              )}
            >
              <span className="font-medium">{p.label}</span>
              <span className="tabular-nums text-fg">{p.value == null ? "—" : formatUsd(p.value)}</span>
              {d != null && <span className={cn("tabular-nums", pnlClass(d))}>{formatUsd(p.diff!)}</span>}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-accent">{selected.label}</h2>
          <p className="text-[11px] text-fg-subtle">{selected.address}</p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Value</div>
            <div className="text-lg font-semibold tabular-nums text-fg">{value == null ? "—" : formatUsd(String(value))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{isVehicle ? "All-in cost" : "Adj. cost"}</div>
            <div className="text-lg font-semibold tabular-nums text-fg-muted">{cost == null ? "—" : formatUsd(String(cost))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">{isVehicle ? "Cost of ownership" : "Equity"}</div>
            <div className={cn("text-lg font-semibold tabular-nums", diff == null ? "text-fg" : pnlClass(diff))}>
              {diff == null ? "—" : formatUsd(String(diff))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
        {daily.data ? (
          <PropertyChart points={daily.data} />
        ) : (
          <div className="h-[286px] rounded-md border border-border bg-card" />
        )}

        <div className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Basis footprints · by category
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(ledger.data ?? []).map((c) => {
                const v = Number(c.total);
                return (
                  <tr key={c.category} className="border-b border-border-light/40">
                    <td className="px-4 py-1.5 text-fg">{c.category}</td>
                    <td className="py-1.5 text-right text-[11px] text-fg-subtle">{c.n}×</td>
                    <td className="py-1.5 text-right text-[10px] text-fg-subtle">
                      {c.effect === "deflate" ? "↓ basis" : "↑ basis"}
                    </td>
                    <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", pnlClass(v))}>
                      {formatUsd(c.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ledger.data && ledger.data.length === 0 && (
            <p className="p-4 text-sm text-fg-muted">No footprints yet.</p>
          )}
        </div>
      </div>
    </section>
  );
}
