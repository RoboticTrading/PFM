"use client";

import { useEffect, useMemo, useState } from "react";

import { SPLIT_CATEGORY } from "@/lib/accounts/register-types";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { SplitDialog, type SplitTarget } from "./SplitDialog";

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
  const [splitTarget, setSplitTarget] = useState<SplitTarget | null>(null);
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

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const bulk = trpc.categories.categorizeBulk.useMutation({
    onSuccess: () => {
      void utils.transactions.forAccount.invalidate();
      setSelected(new Set());
      setBulkCategory("");
    },
  });

  function toggleRow(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyBulk() {
    if (!bulkCategory) return;
    const txns = rows
      .filter((t) => selected.has(`${t.sourceSchema}:${t.sourceTxnId}`))
      .map((t) => ({
        sourceSchema: t.sourceSchema,
        sourceTxnId: t.sourceTxnId,
        txnDate: t.date.slice(0, 10),
        amount: t.amount,
      }));
    bulk.mutate({ categoryId: bulkCategory, txns });
  }

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

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
          <span className="text-sm font-medium text-fg">{selected.size} selected</span>
          <select
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
          >
            <option value="">Assign category…</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.kind} · {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyBulk}
            disabled={!bulkCategory || bulk.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {bulk.isPending ? "Applying…" : "Apply to all"}
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-sm text-fg-muted outline-none hover:text-fg"
          >
            Clear
          </button>
        </div>
      )}

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
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(rows.map((r) => `${r.sourceSchema}:${r.sourceTxnId}`))
                          : new Set(),
                      )
                    }
                  />
                </th>
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
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        aria-label="Select transaction"
                        checked={selected.has(key)}
                        onChange={() => toggleRow(key)}
                      />
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs text-fg-muted">
                      {t.date.slice(0, 10)}
                    </td>
                    <td className="px-3 py-1.5 text-fg">{t.description}</td>
                    <td className="px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        {t.categoryId === SPLIT_CATEGORY ? (
                          <span className="text-sm text-info">split</span>
                        ) : (
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
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setSplitTarget({
                              sourceSchema: t.sourceSchema,
                              sourceTxnId: t.sourceTxnId,
                              txnDate: t.date.slice(0, 10),
                              total: t.amount,
                              description: t.description,
                            })
                          }
                          className="text-xs text-fg-subtle outline-none hover:text-accent focus-visible:text-accent"
                        >
                          split
                        </button>
                      </div>
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
      {splitTarget && (
        <SplitDialog
          target={splitTarget}
          categories={categories.data ?? []}
          onClose={() => setSplitTarget(null)}
        />
      )}
    </main>
  );
}
