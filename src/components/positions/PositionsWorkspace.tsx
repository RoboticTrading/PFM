"use client";

import { useMemo, useState } from "react";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { PairFills } from "./PairFills";
import { PositionsTable } from "./PositionsTable";

type Tab = "history" | "mine" | "pair";

const TABS: { key: Tab; label: string }[] = [
  { key: "history", label: "Broker history" },
  { key: "mine", label: "My positions" },
  { key: "pair", label: "Pair fills" },
];

/** Positions matcher — the broker's recorded position history, the positions
 *  you've paired yourself, and a tool to pair raw fills into a new position. */
export function PositionsWorkspace() {
  const [tab, setTab] = useState<Tab>("history");

  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Positions
        </h1>
        <p className="text-sm text-fg-muted">
          Match broker fills into the positions you actually hold.
        </p>
      </header>

      <div className="mb-4 inline-flex gap-1 rounded-md border border-border bg-base p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-3 py-1.5 text-sm outline-none transition-colors",
              tab === t.key
                ? "bg-card font-medium text-accent"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "history" && (
        <div className="rounded-md border border-border bg-surface">
          <PositionsTable />
        </div>
      )}
      {tab === "mine" && <MyPositions />}
      {tab === "pair" && <PairFills />}
    </main>
  );
}

/** PFM's own paired positions. */
function MyPositions() {
  const list = trpc.positions.list.useQuery();
  const rows = useMemo(() => list.data ?? [], [list.data]);

  if (list.isLoading) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface p-4 text-sm text-fg-muted">
        No paired positions yet — use <span className="text-accent">Pair fills</span> to
        create one.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle">
            <th className="px-3 py-2 text-left font-medium">Symbol</th>
            <th className="px-3 py-2 text-left font-medium">Class</th>
            <th className="px-3 py-2 text-left font-medium">Structure</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-left font-medium">Opened</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-medium text-fg">{p.symbol}</td>
              <td className="px-3 py-1.5 text-fg-muted">{p.instrumentClass}</td>
              <td className="px-3 py-1.5 text-fg-muted">{p.structureType ?? "—"}</td>
              <td className="px-3 py-1.5">
                <span
                  className={cn(
                    "text-xs uppercase tracking-wide",
                    p.status === "open" ? "text-success" : "text-fg-subtle",
                  )}
                >
                  {p.status}
                </span>
              </td>
              <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                {p.openedAt ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
