"use client";

import { useState } from "react";

import { MonthNav } from "@/components/common/MonthNav";
import { CashFlowCard } from "@/components/dashboard/CashFlowCard";
import { NetWorthCard } from "@/components/dashboard/NetWorthCard";
import { currentMonth, shiftMonth } from "@/lib/date";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/** Reports workspace — net worth, cash flow, and the category breakdown for a
 *  chosen month. All read-only, sourced from the categorization links. */
export function Reports() {
  const [win, setWin] = useState(() => currentMonth());

  const netWorth = trpc.reports.netWorth.useQuery();
  const cashFlow = trpc.reports.cashFlow.useQuery({ from: win.from, to: win.to });
  const byCategory = trpc.reports.categoryReport.useQuery({
    from: win.from,
    to: win.to,
  });

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Reports
          </h1>
          <p className="text-sm text-fg-muted">
            Cash flow & category breakdown · {win.label}
          </p>
        </div>
        <MonthNav
          label={win.label}
          onShift={(d) => setWin((w) => shiftMonth(w, d))}
        />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {netWorth.data ? (
          <NetWorthCard data={netWorth.data} />
        ) : (
          <CardSkeleton label="Net worth" />
        )}
        {cashFlow.data ? (
          <CashFlowCard label={win.label} data={cashFlow.data} />
        ) : (
          <CardSkeleton label="Cash flow" />
        )}
      </div>

      <section className="mt-4 rounded-md border border-border bg-card p-5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          By category · {win.label}
        </div>
        {byCategory.isLoading ? (
          <p className="mt-3 text-sm text-fg-muted">Loading…</p>
        ) : !byCategory.data || byCategory.data.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">
            No categorized activity in this period.
          </p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="text-left font-medium">Category</th>
                <th className="text-left font-medium">Kind</th>
                <th className="text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {byCategory.data.map((r) => {
                const neg = r.total.startsWith("-");
                return (
                  <tr key={r.categoryId} className="border-t border-border">
                    <td className="py-1.5 text-fg">{r.categoryName}</td>
                    <td className="py-1.5 text-fg-muted">{r.kind}</td>
                    <td
                      className={cn(
                        "py-1.5 text-right font-mono tabular-nums",
                        neg ? "text-danger" : "text-fg",
                      )}
                    >
                      {formatUsd(r.total)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function CardSkeleton({ label }: { label: string }) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <p className="mt-3 text-sm text-fg-muted">Loading…</p>
    </section>
  );
}
