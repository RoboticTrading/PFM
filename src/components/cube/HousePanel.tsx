"use client";

import { PropertyChart } from "@/components/cube/PropertyChart";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

function pnlClass(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-fg-muted";
}

/**
 * The house as a marked-to-market asset — Bob's BolivarDr model, live: current value / adjusted cost /
 * equity, the value-vs-cost chart, and the basis footprints by category (expenses inflate, rent
 * deflates). Cash-purchased, unencumbered — the value is pure equity.
 */
export function HousePanel() {
  const properties = trpc.cube.properties.useQuery();
  const property = properties.data?.[0];
  const key = property?.propertyKey ?? "";
  const daily = trpc.cube.propertyDaily.useQuery({ propertyKey: key }, { enabled: !!key });
  const ledger = trpc.cube.propertyLedger.useQuery({ propertyKey: key }, { enabled: !!key });

  if (properties.data && properties.data.length === 0) {
    return (
      <section className="mt-4 rounded-md border border-border bg-card px-4 py-3">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Real estate</div>
        <p className="mt-1 text-sm text-fg-muted">
          No property configured yet. Seed one via the house asset setup (RentCast valuation).
        </p>
      </section>
    );
  }
  if (!property) return null;

  const value = property.value == null ? null : Number(property.value);
  const cost = property.adjustedCost == null ? null : Number(property.adjustedCost);
  const diff = property.diff == null ? null : Number(property.diff);

  return (
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="font-display text-sm font-semibold text-accent">{property.label}</h2>
          <p className="text-[11px] text-fg-subtle">{property.address}</p>
        </div>
        <div className="flex items-center gap-5 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Value</div>
            <div className="text-lg font-semibold tabular-nums text-fg">{value == null ? "—" : formatUsd(String(value))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Adj. cost</div>
            <div className="text-lg font-semibold tabular-nums text-fg-muted">{cost == null ? "—" : formatUsd(String(cost))}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fg-subtle">Equity</div>
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
