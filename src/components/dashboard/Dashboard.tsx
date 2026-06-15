"use client";

import { useMemo } from "react";

import { currentMonth } from "@/lib/date";
import { trpc } from "@/lib/trpc/client";

import { BudgetCard } from "./BudgetCard";
import { CashFlowCard } from "./CashFlowCard";
import { NetWorthCard } from "./NetWorthCard";

/** The cockpit — net worth, this month's cash flow, and budget vs actual. */
export function Dashboard() {
  const month = useMemo(() => currentMonth(), []);
  const netWorth = trpc.reports.netWorth.useQuery();
  const cashFlow = trpc.reports.cashFlow.useQuery({
    from: month.from,
    to: month.to,
  });
  const budget = trpc.budgets.vsActual.useQuery({ period: month.period });

  return (
    <main className="px-8 py-6">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
          Dashboard
        </h1>
        <p className="text-sm text-fg-muted">The cockpit · {month.label}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {netWorth.data ? (
          <NetWorthCard data={netWorth.data} />
        ) : (
          <CardSkeleton label="Net worth" />
        )}
        {cashFlow.data ? (
          <CashFlowCard label={month.label} data={cashFlow.data} />
        ) : (
          <CardSkeleton label="Cash flow" />
        )}
      </div>

      <div className="mt-4">
        {budget.data ? (
          <BudgetCard label={month.label} rows={budget.data} />
        ) : (
          <CardSkeleton label="Budget vs actual" />
        )}
      </div>
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
