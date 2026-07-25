"use client";

import { useMemo, useState } from "react";

import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

type Dimension = "underlying" | "instrumentType" | "direction" | "source";

const DIMENSIONS: { key: Dimension; label: string }[] = [
  { key: "underlying", label: "Underlying" },
  { key: "instrumentType", label: "Instrument" },
  { key: "direction", label: "Direction" },
  { key: "source", label: "Broker" },
];

function pnlClass(v: number) {
  return v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-fg-muted";
}

/**
 * The Cube — the sliceable read-model over every reconstructed trade. Bob's whole book,
 * any angle: P&L by underlying / instrument / direction / broker, and the trade register
 * beneath. Truth at the core — the Match Health chip shows what's matched vs unmatched.
 */
export function Cube() {
  const [dimension, setDimension] = useState<Dimension>("underlying");
  const [drill, setDrill] = useState<string | null>(null); // clicked underlying → filter

  const filter = useMemo(
    () => (drill && dimension === "underlying" ? { underlying: drill } : {}),
    [drill, dimension],
  );

  const summary = trpc.cube.summary.useQuery(filter);
  const perf = trpc.cube.performance.useQuery({ dimension, filter: {} });
  const trades = trpc.cube.trades.useQuery({ ...filter, limit: 150 });
  const health = trpc.cube.matchHealth.useQuery();
  const holdings = trpc.cube.holdings.useQuery();
  const cashFlow = trpc.cube.cashFlow.useQuery();

  const maxAbs = useMemo(() => {
    const rows = perf.data ?? [];
    return Math.max(1, ...rows.map((r) => Math.abs(Number(r.realizedPnl))));
  }, [perf.data]);

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            The Cube
          </h1>
          <p className="text-sm text-fg-muted">
            Every trade, every instrument, every broker — sliced any way you ask.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(health.data ?? []).map((h) => (
            <span
              key={h.source}
              title={`${h.roundTrips.toLocaleString()} round-trips · ${h.leftovers.toLocaleString()} leftover legs`}
              className="rounded-full border border-border-light bg-card px-3 py-1 text-[11px] text-fg-muted"
            >
              {h.source} match{" "}
              <span className={h.matchRate > 0.97 ? "text-success" : "text-accent"}>
                {(h.matchRate * 100).toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </header>

      {/* headline stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Realized P&L" value={summary.data ? formatUsd(summary.data.realizedPnl) : "—"}
              tone={summary.data ? Number(summary.data.realizedPnl) : 0} />
        <Stat label="Round-trips" value={summary.data?.trades.toLocaleString() ?? "—"} />
        <Stat label="Win rate" value={summary.data ? `${(summary.data.winRate * 100).toFixed(0)}%` : "—"} />
        <Stat label="Contracts" value={summary.data?.contracts.toLocaleString() ?? "—"} />
        <Stat label="Underlyings" value={summary.data?.underlyings.toLocaleString() ?? "—"} />
        <Stat label="Span" value={summary.data?.first ? `${summary.data.first} → ${summary.data.last}` : "—"} small />
      </div>

      {/* dimension slicer */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">Slice by</span>
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            onClick={() => { setDimension(d.key); setDrill(null); }}
            className={cn(
              "rounded-md px-3 py-1 text-xs transition-colors",
              dimension === d.key
                ? "bg-accent/15 text-accent"
                : "text-fg-muted hover:bg-muted hover:text-fg",
            )}
          >
            {d.label}
          </button>
        ))}
        {drill && (
          <button onClick={() => setDrill(null)}
                  className="ml-2 rounded-md bg-muted px-2 py-1 text-xs text-fg-muted hover:text-fg">
            {drill} ✕
          </button>
        )}
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        {/* performance by dimension */}
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            P&L by {DIMENSIONS.find((d) => d.key === dimension)!.label}
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                {(perf.data ?? []).map((r) => {
                  const v = Number(r.realizedPnl);
                  const w = Math.min(100, (Math.abs(v) / maxAbs) * 100);
                  const clickable = dimension === "underlying";
                  return (
                    <tr
                      key={r.key}
                      onClick={() => clickable && setDrill(r.key)}
                      className={cn(
                        "border-b border-border-light/50",
                        clickable && "cursor-pointer hover:bg-muted/50",
                        drill === r.key && "bg-accent/10",
                      )}
                    >
                      <td className="px-4 py-1.5 font-medium text-fg">{r.key}</td>
                      <td className="py-1.5 text-right text-xs text-fg-subtle">{r.trades}t</td>
                      <td className="py-1.5 text-right text-xs text-fg-subtle">
                        {r.trades ? Math.round((r.wins / r.trades) * 100) : 0}%
                      </td>
                      <td className="w-28 py-1.5 pr-2">
                        <div className="ml-auto h-1.5 rounded-full"
                             style={{ width: `${w}%`,
                                      backgroundColor: v >= 0 ? "var(--color-success)" : "var(--color-danger)",
                                      opacity: 0.55 }} />
                      </td>
                      <td className={cn("px-4 py-1.5 text-right font-medium tabular-nums", pnlClass(v))}>
                        {formatUsd(r.realizedPnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {perf.isLoading && <p className="p-4 text-sm text-fg-muted">Loading…</p>}
            {perf.data && perf.data.length === 0 && <p className="p-4 text-sm text-fg-muted">No trades.</p>}
          </div>
        </section>

        {/* trade register */}
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Register {drill ? `· ${drill}` : ""} · newest first
          </div>
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wide text-fg-subtle">
                <tr className="border-b border-border">
                  <th className="px-4 py-1.5 text-left font-medium">Symbol</th>
                  <th className="py-1.5 text-left font-medium">Dir</th>
                  <th className="py-1.5 text-right font-medium">Qty</th>
                  <th className="py-1.5 text-left font-medium">Opened</th>
                  <th className="py-1.5 text-right font-medium">Held</th>
                  <th className="px-4 py-1.5 text-right font-medium">P&L</th>
                </tr>
              </thead>
              <tbody>
                {(trades.data ?? []).map((t) => {
                  const v = Number(t.realizedPnl);
                  return (
                    <tr key={t.tradeId} className="border-b border-border-light/40 hover:bg-muted/40">
                      <td className="px-4 py-1.5 font-mono text-xs text-fg" title={t.instrumentType}>
                        {t.symbol}
                      </td>
                      <td className={cn("py-1.5 text-xs", t.direction === "LONG" ? "text-success" : "text-danger")}>
                        {t.direction === "LONG" ? "L" : "S"}
                      </td>
                      <td className="py-1.5 text-right text-xs text-fg-muted tabular-nums">{t.qty}</td>
                      <td className="py-1.5 text-xs text-fg-muted">{t.openedAt?.slice(0, 10)}</td>
                      <td className="py-1.5 text-right text-xs text-fg-subtle">
                        {t.heldDays == null ? "—" : `${t.heldDays}d`}
                      </td>
                      <td className={cn("px-4 py-1.5 text-right tabular-nums", pnlClass(v))}>{formatUsd(t.realizedPnl)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {trades.isLoading && <p className="p-4 text-sm text-fg-muted">Loading…</p>}
          </div>
        </section>
      </div>

      {/* holdings + broker cash flow — the non-trade facts */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Holdings & Income · covered-call ETF sleeve
          </div>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wide text-fg-subtle">
              <tr className="border-b border-border-light/50">
                <th className="px-4 py-1.5 text-left font-medium">Symbol</th>
                <th className="py-1.5 text-right font-medium">Shares</th>
                <th className="py-1.5 text-right font-medium">Cost basis</th>
                <th className="py-1.5 text-right font-medium">Dividends</th>
                <th className="px-4 py-1.5 text-right font-medium">% returned</th>
              </tr>
            </thead>
            <tbody>
              {(holdings.data ?? []).map((h) => (
                <tr key={h.symbol} className="border-b border-border-light/40">
                  <td className="px-4 py-1.5 font-medium text-fg">{h.symbol}</td>
                  <td className="py-1.5 text-right text-xs text-fg-muted tabular-nums">
                    {Number(h.shares).toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right text-xs tabular-nums text-fg-muted">{formatUsd(h.cashCostBasis)}</td>
                  <td className="py-1.5 text-right text-xs tabular-nums text-success">{formatUsd(h.dividendsReceived)}</td>
                  <td className="px-4 py-1.5 text-right text-xs tabular-nums text-accent">{h.pctCapitalReturned}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {holdings.data && holdings.data.length === 0 && (
            <p className="p-4 text-sm text-fg-muted">No ETF holdings.</p>
          )}
        </section>

        <section className="rounded-md border border-border bg-card">
          <div className="border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
            Broker cash flow · by category
          </div>
          <table className="w-full text-sm">
            <tbody>
              {(cashFlow.data ?? []).map((c) => {
                const v = Number(c.net);
                return (
                  <tr key={c.category} className="border-b border-border-light/40">
                    <td className="px-4 py-1.5 capitalize text-fg">{c.category}</td>
                    <td className="py-1.5 text-right text-xs text-fg-subtle">{c.n}×</td>
                    <td className={cn("px-4 py-1.5 text-right tabular-nums", pnlClass(v))}>{formatUsd(c.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cashFlow.data && cashFlow.data.length === 0 && (
            <p className="p-4 text-sm text-fg-muted">No broker cash flow.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, tone, small }: { label: string; value: string; tone?: number; small?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{label}</div>
      <div className={cn(small ? "text-xs" : "text-lg", "mt-0.5 font-semibold tabular-nums",
                         tone === undefined ? "text-fg" : pnlClass(tone))}>
        {value}
      </div>
    </div>
  );
}
