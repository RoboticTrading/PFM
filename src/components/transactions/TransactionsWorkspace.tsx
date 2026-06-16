"use client";

import { useEffect, useMemo, useState } from "react";

import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Transactions workspace — pick an account, then categorize its register inline.
 * The Category cell is a live `<select>` backed by `categories.categorize`
 * (replaces any prior categorization; lineage by source_txn_id, never copied).
 */
export function TransactionsWorkspace() {
  const accounts = trpc.accounts.list.useQuery();
  const [accountId, setAccountId] = useState<string>("");

  // Default to the first account once loaded.
  useEffect(() => {
    if (!accountId && accounts.data && accounts.data.length > 0) {
      setAccountId(accounts.data[0].id);
    }
  }, [accountId, accounts.data]);

  const categories = trpc.categories.list.useQuery();
  const register = trpc.transactions.forAccount.useQuery(
    { accountId, limit: 500 },
    { enabled: accountId !== "" },
  );

  const utils = trpc.useUtils();
  const [savingId, setSavingId] = useState<string | null>(null);
  const categorize = trpc.categories.categorize.useMutation({
    onSettled: () => {
      void utils.transactions.forAccount.invalidate();
      setSavingId(null);
    },
  });

  const rows = useMemo(() => register.data ?? [], [register.data]);
  const uncategorized = useMemo(
    () => rows.filter((r) => !r.categoryId).length,
    [rows],
  );

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Transactions
          </h1>
          <p className="text-sm text-fg-muted">
            Categorize an account&rsquo;s register · {rows.length} shown
            {uncategorized > 0 && (
              <span className="text-fg-subtle"> · {uncategorized} uncategorized</span>
            )}
          </p>
        </div>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Account
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="min-w-[16rem] rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
          >
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.institutionName}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="rounded-md border border-border bg-base">
        {register.isLoading ? (
          <p className="p-4 text-sm text-fg-muted">Loading transactions…</p>
        ) : register.isError ? (
          <p className="p-4 text-sm text-danger">Failed to load transactions.</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">No transactions for this account.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="px-3 py-2 text-left font-medium">Date</th>
                <th className="px-3 py-2 text-left font-medium">Description</th>
                <th className="px-3 py-2 text-left font-medium">Category</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const key = `${t.sourceSchema}:${t.sourceTxnId}`;
                const negative = t.amount.startsWith("-");
                const saving = savingId === key && categorize.isPending;
                return (
                  <tr key={key} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                      {t.date.slice(0, 10)}
                    </td>
                    <td className="px-3 py-1.5 text-fg">{t.description}</td>
                    <td className="px-3 py-1.5">
                      <select
                        aria-label="Category"
                        value={t.categoryId ?? ""}
                        disabled={saving}
                        onChange={(e) => {
                          const categoryId = e.target.value;
                          if (!categoryId) return;
                          setSavingId(key);
                          categorize.mutate({
                            sourceSchema: t.sourceSchema,
                            sourceTxnId: t.sourceTxnId,
                            txnDate: t.date.slice(0, 10),
                            categoryId,
                            amount: t.amount,
                          });
                        }}
                        className={cn(
                          "max-w-[14rem] rounded-md border border-border bg-card px-2 py-1 text-sm outline-none focus-visible:border-accent",
                          t.categoryId ? "text-fg" : "text-fg-subtle italic",
                        )}
                      >
                        <option value="">uncategorized</option>
                        {(categories.data ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.kind} · {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-1.5 text-right font-mono tabular-nums",
                        negative ? "text-danger" : "text-fg",
                      )}
                    >
                      {formatUsd(t.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {categorize.isError && (
        <p className="mt-3 text-sm text-danger">
          Couldn&rsquo;t save that categorization — try again.
        </p>
      )}
    </main>
  );
}
