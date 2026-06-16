"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/** Infer a leg side from a Schwab trade `type` string. */
function inferSide(type: string | null): "buy" | "sell" {
  return type && /sell/i.test(type) ? "sell" : "buy";
}
function abs(n: string): string {
  return n.startsWith("-") ? n.slice(1) : n;
}

/** Select raw broker fills and pair them into a new PFM position. Each leg
 *  references its source fill (never copied). Wraps positions.pair. */
export function PairFills() {
  const fills = trpc.positions.availableFills.useQuery({ limit: 150 });
  const utils = trpc.useUtils();
  const pair = trpc.positions.pair.useMutation({
    onSuccess: () => {
      void utils.positions.list.invalidate();
      void utils.positions.unmatched.invalidate();
      setSelected(new Set());
      setSymbol("");
      setStructureType("");
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [symbol, setSymbol] = useState("");
  const [instrumentClass, setInstrumentClass] = useState("equity");
  const [structureType, setStructureType] = useState("");

  const rows = useMemo(() => fills.data ?? [], [fills.data]);

  const chosen = useMemo(
    () =>
      rows.filter(
        (f) => f.activityId != null && selected.has(String(f.activityId)),
      ),
    [rows, selected],
  );

  const legs = chosen
    .filter((f) => f.quantity != null && f.price != null)
    .map((f) => ({
      sourceSchema: "schwab_brokerage",
      sourceFillId: String(f.activityId),
      side: inferSide(f.type),
      quantity: abs(f.quantity as string),
      price: f.price as string,
    }));

  const valid = symbol.trim() !== "" && instrumentClass.trim() !== "" && legs.length > 0;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Default the symbol to the first selected fill's symbol.
    if (!symbol) {
      const f = rows.find((r) => String(r.activityId) === id);
      if (f?.symbol) setSymbol(f.symbol);
    }
  }

  return (
    <div className="space-y-4">
      {/* The pairing form */}
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          New position from {legs.length} selected fill{legs.length === 1 ? "" : "s"}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
            Symbol
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. NDXP"
              className="w-32 rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
            Instrument class
            <input
              value={instrumentClass}
              onChange={(e) => setInstrumentClass(e.target.value)}
              className="w-32 rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-fg-subtle">
            Structure (optional)
            <input
              value={structureType}
              onChange={(e) => setStructureType(e.target.value)}
              placeholder="e.g. vertical_spread"
              className="w-44 rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          <button
            type="button"
            disabled={!valid || pair.isPending}
            onClick={() =>
              pair.mutate({
                symbol: symbol.trim(),
                instrumentClass: instrumentClass.trim(),
                structureType: structureType.trim() || undefined,
                legs,
              })
            }
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {pair.isPending ? "Pairing…" : "Pair into position"}
          </button>
        </div>
        {pair.isError && (
          <p className="mt-2 text-sm text-danger">Couldn’t pair — {pair.error.message}</p>
        )}
        {pair.isSuccess && (
          <p className="mt-2 text-sm text-success">Position created.</p>
        )}
      </section>

      {/* Selectable fills */}
      <div className="overflow-hidden rounded-md border border-border bg-surface">
        {fills.isLoading ? (
          <p className="p-4 text-sm text-fg-muted">Loading fills…</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">No broker trade fills found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Symbol</th>
                <th className="px-3 py-2 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Side</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const id = String(f.activityId);
                const checked = selected.has(id);
                const side = inferSide(f.type);
                return (
                  <tr
                    key={id}
                    onClick={() => toggle(id)}
                    className={cn(
                      "cursor-pointer border-b border-border last:border-0",
                      checked ? "bg-card" : "hover:bg-hover",
                    )}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                      {f.tradeDate}
                    </td>
                    <td className="px-3 py-1.5 text-fg">{f.symbol}</td>
                    <td className="px-3 py-1.5 text-fg-muted">{f.type}</td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-xs uppercase",
                        side === "buy" ? "text-success" : "text-danger",
                      )}
                    >
                      {side}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-fg-muted">
                      {f.quantity ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono tabular-nums text-fg-muted">
                      {f.price ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
