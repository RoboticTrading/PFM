"use client";

import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * The Net Worth cockpit — Bob's whole balance sheet in one persistent view. Assets (house +
 * ETF sleeve mark-to-market + car + checking) minus liabilities (brokerage margin debit + the
 * credit cards). Point-in-time balances are Bob-seeded (cube.account_snapshot); the marked
 * assets come live off the cube. Dense and legible, same language as The Cube.
 */
export function NetWorth() {
  const nw = trpc.cube.netWorth.useQuery();
  const d = nw.data;

  const net = d ? Number(d.netWorth) : 0;
  const assets = d ? Number(d.totalAssets) : 0;
  const liabs = d ? Number(d.totalLiabilities) : 0;
  const total = assets + liabs || 1;
  const assetPct = (assets / total) * 100;

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Net Worth
          </h1>
          <p className="text-sm text-fg-muted">
            Everything owned, minus everything owed — the whole balance sheet, live.
          </p>
        </div>
        {d && (
          <div className="rounded-md border border-border-light bg-card px-3 py-1 text-[11px] text-fg-muted">
            ETF sleeve income collected{" "}
            <span className="font-medium text-success tabular-nums">{formatUsd(d.etfDividends)}</span>
          </div>
        )}
      </header>

      {/* headline — total net worth */}
      <section className="rounded-md border border-border bg-card px-6 py-6">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Total net worth
        </div>
        <div
          className={cn(
            "mt-1 font-display text-5xl font-semibold tabular-nums",
            net > 0 ? "text-success" : net < 0 ? "text-danger" : "text-fg",
          )}
        >
          {d ? formatUsd(d.netWorth) : "—"}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg-muted">
          <span>
            Assets <span className="font-medium text-fg tabular-nums">{d ? formatUsd(d.totalAssets) : "—"}</span>
          </span>
          <span>
            Liabilities{" "}
            <span className="font-medium text-danger tabular-nums">
              {d ? formatUsd(`-${d.totalLiabilities}`) : "—"}
            </span>
          </span>
        </div>

        {/* assets vs liabilities bar */}
        {d && (
          <div className="mt-4">
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full"
                style={{ width: `${assetPct}%`, backgroundColor: "var(--color-success)", opacity: 0.7 }}
              />
              <div
                className="h-full"
                style={{ width: `${100 - assetPct}%`, backgroundColor: "var(--color-danger)", opacity: 0.7 }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
              <span>assets {assetPct.toFixed(0)}%</span>
              <span>liabilities {(100 - assetPct).toFixed(0)}%</span>
            </div>
          </div>
        )}
      </section>

      {/* the two ledgers */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Ledger
          title="Assets"
          lines={d?.assets}
          subtotal={d?.totalAssets}
          tone="text-success"
          empty="No assets."
        />
        <Ledger
          title="Liabilities"
          lines={d?.liabilities}
          subtotal={d?.totalLiabilities}
          tone="text-danger"
          negate
          empty="No liabilities — debt-free."
        />
      </div>

      {nw.isLoading && <p className="mt-4 text-sm text-fg-muted">Loading…</p>}
    </main>
  );
}

function Ledger({
  title,
  lines,
  subtotal,
  tone,
  negate,
  empty,
}: {
  title: string;
  lines?: { label: string; amount: string }[];
  subtotal?: string;
  tone: string;
  negate?: boolean;
  empty: string;
}) {
  const fmt = (v: string) => formatUsd(negate ? `-${v}` : v);
  return (
    <section className="rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">{title}</span>
        <span className={cn("text-sm font-semibold tabular-nums", tone)}>
          {subtotal ? fmt(subtotal) : "—"}
        </span>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {(lines ?? []).map((l) => (
            <tr key={l.label} className="border-b border-border-light/40">
              <td className="px-4 py-1.5 text-fg">{l.label}</td>
              <td className={cn("px-4 py-1.5 text-right tabular-nums", tone)}>{fmt(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {lines && lines.length === 0 && <p className="p-4 text-sm text-fg-muted">{empty}</p>}
    </section>
  );
}
