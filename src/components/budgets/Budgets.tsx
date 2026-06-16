"use client";

import { useMemo, useState } from "react";

import { MonthNav } from "@/components/common/MonthNav";
import { BudgetCard } from "@/components/dashboard/BudgetCard";
import { currentMonth, shiftMonth } from "@/lib/date";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";

const MONEY_RE = /^-?\d+(\.\d+)?$/;

/** Budgets workspace — set a category's target for the month and see it vs
 *  actual. The first governed write in the UI (`budgets.setBudget`). */
export function Budgets() {
  const [win, setWin] = useState(() => currentMonth());
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");

  const utils = trpc.useUtils();
  const vsActual = trpc.budgets.vsActual.useQuery({ period: win.period });
  const all = trpc.budgets.list.useQuery();
  const categories = trpc.categories.list.useQuery();

  const setBudget = trpc.budgets.setBudget.useMutation({
    onSuccess: () => {
      void utils.budgets.vsActual.invalidate();
      void utils.budgets.list.invalidate();
      setAmount("");
    },
  });

  const valid = categoryId !== "" && MONEY_RE.test(amount.trim());

  const thisPeriod = useMemo(
    () => (all.data ?? []).filter((b) => b.period === win.period),
    [all.data, win.period],
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBudget.mutate({ categoryId, period: win.period, amount: amount.trim() });
  }

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Budgets
          </h1>
          <p className="text-sm text-fg-muted">Set targets & track vs actual · {win.label}</p>
        </div>
        <MonthNav label={win.label} onShift={(d) => setWin((w) => shiftMonth(w, d))} />
      </header>

      {/* Set / update a budget */}
      <section className="mb-4 rounded-md border border-border bg-card p-5">
        <div className="mb-3 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Set a budget · {win.label}
        </div>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="min-w-[14rem] rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
            >
              <option value="">Select a category…</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.kind} · {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Amount
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className="w-32 rounded-md border border-border bg-base px-2 py-1.5 text-right font-mono text-sm text-fg outline-none focus-visible:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={!valid || setBudget.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {setBudget.isPending ? "Saving…" : "Save"}
          </button>
          {setBudget.isError && (
            <span className="text-sm text-danger">Couldn’t save — check the amount.</span>
          )}
        </form>
      </section>

      {/* Vs actual for the month */}
      {vsActual.data ? (
        <BudgetCard label={win.label} rows={vsActual.data} />
      ) : (
        <section className="rounded-md border border-border bg-card p-5">
          <p className="text-sm text-fg-muted">Loading budget vs actual…</p>
        </section>
      )}

      {/* All budgets set for this month */}
      <section className="mt-4 rounded-md border border-border bg-card p-5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Budgets set · {win.label}
        </div>
        {thisPeriod.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">No budgets set for this period yet.</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="text-left font-medium">Category</th>
                <th className="text-right font-medium">Budget</th>
              </tr>
            </thead>
            <tbody>
              {thisPeriod.map((b) => (
                <tr key={b.id} className="border-t border-border">
                  <td className="py-1.5 text-fg">{b.categoryName}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums text-fg-muted">
                    {formatUsd(b.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
