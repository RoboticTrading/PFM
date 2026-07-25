"use client";

import { useEffect, useMemo, useState } from "react";

import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { EMPTY_FACETS, filterTransactions, type TxnFacets } from "./filter";
import { SplitDialog, type SplitTarget } from "./SplitDialog";
import { TxnFilterBar } from "./TxnFilterBar";

/**
 * Transactions workspace — pick an account (or all), filter the register, and
 * categorize inline. The category control is a searchable tree picker backed by
 * `categories.categorize` (replaces any prior categorization; lineage by
 * source_txn_id, never copied). Splits, bulk assignment, and an uncategorized
 * burn-down all run against the unified `cube.v_ledger`.
 */
export function TransactionsWorkspace() {
  const accounts = trpc.accounts.list.useQuery();
  const [accountId, setAccountId] = useState<string>("");

  // Default to "All accounts" once accounts load — the whole ledger, unified.
  useEffect(() => {
    if (!accountId && accounts.data && accounts.data.length > 0) {
      setAccountId(ALL_ACCOUNTS);
    }
  }, [accountId, accounts.data]);

  const categories = trpc.categories.list.useQuery();
  const register = trpc.transactions.forAccount.useQuery(
    { accountId, limit: 1000 },
    { enabled: accountId !== "" },
  );

  const utils = trpc.useUtils();
  const invalidateRegister = () =>
    void utils.transactions.forAccount.invalidate();

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [splitTarget, setSplitTarget] = useState<SplitTarget | null>(null);
  const categorize = trpc.categories.categorize.useMutation({
    onSettled: () => {
      invalidateRegister();
      setSavingKey(null);
    },
  });

  const [facets, setFacets] = useState<TxnFacets>(EMPTY_FACETS);
  const rows = useMemo(() => register.data ?? [], [register.data]);
  const filtered = useMemo(
    () => filterTransactions(rows, facets),
    [rows, facets],
  );
  const uncategorized = useMemo(
    () => rows.filter((r) => !r.categoryId).length,
    [rows],
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  const bulk = trpc.categories.categorizeBulk.useMutation({
    onSuccess: () => {
      invalidateRegister();
      setSelected(new Set());
      setBulkCategory(null);
    },
  });

  // Clearing/changing the visible set drops any now-hidden selections.
  const visibleKeys = useMemo(
    () => new Set(filtered.map((t) => `${t.sourceSchema}:${t.sourceTxnId}`)),
    [filtered],
  );
  const selectedVisible = useMemo(
    () => [...selected].filter((k) => visibleKeys.has(k)),
    [selected, visibleKeys],
  );

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
    const chosen = new Set(selectedVisible);
    const txns = filtered
      .filter((t) => chosen.has(`${t.sourceSchema}:${t.sourceTxnId}`))
      .map((t) => ({
        sourceSchema: t.sourceSchema,
        sourceTxnId: t.sourceTxnId,
        txnDate: t.date.slice(0, 10),
        amount: t.amount,
      }));
    if (txns.length > 0) bulk.mutate({ categoryId: bulkCategory, txns });
  }

  const pickerCats = categories.data ?? [];

  const uncategorizedActive = facets.category === "uncategorized";

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Transactions
          </h1>
          <p className="text-sm text-fg-muted">
            Categorize the ledger · {filtered.length} shown
            {uncategorized > 0 && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() =>
                    setFacets((f) => ({
                      ...f,
                      category: uncategorizedActive ? "all" : "uncategorized",
                    }))
                  }
                  className={cn(
                    "underline-offset-2 outline-none hover:underline focus-visible:underline",
                    uncategorizedActive ? "text-accent" : "text-fg-subtle",
                  )}
                >
                  {uncategorized} uncategorized
                  {uncategorizedActive ? " (filtering)" : ""}
                </button>
              </>
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
            <option value={ALL_ACCOUNTS}>All accounts</option>
            {(accounts.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.institutionName}
              </option>
            ))}
          </select>
        </label>
      </header>

      {selectedVisible.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
          <span className="text-sm font-medium text-fg">
            {selectedVisible.length} selected
          </span>
          <div className="w-64">
            <CategoryPicker
              categories={pickerCats}
              value={bulkCategory}
              onSelect={setBulkCategory}
              placeholder="Assign category…"
              ariaLabel="Bulk category"
            />
          </div>
          <button
            type="button"
            onClick={applyBulk}
            disabled={!bulkCategory || bulk.isPending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {bulk.isPending
              ? "Applying…"
              : `Apply to ${selectedVisible.length}`}
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
        <TxnFilterBar
          facets={facets}
          onChange={setFacets}
          showing={filtered.length}
          total={rows.length}
        />
        {register.isLoading ? (
          <p className="p-4 text-sm text-fg-muted">Loading transactions…</p>
        ) : register.isError ? (
          <p className="p-4 text-sm text-danger">Failed to load transactions.</p>
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">No transactions for this account.</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-fg-muted">No transactions match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={
                      filtered.length > 0 &&
                      selectedVisible.length === filtered.length
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? new Set(
                              filtered.map(
                                (r) => `${r.sourceSchema}:${r.sourceTxnId}`,
                              ),
                            )
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
              {filtered.map((t) => {
                const key = `${t.sourceSchema}:${t.sourceTxnId}`;
                const negative = t.amount.startsWith("-");
                const saving = savingKey === key && categorize.isPending;
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
                        <div className="w-56">
                          <CategoryPicker
                            categories={pickerCats}
                            value={t.categoryId}
                            disabled={saving}
                            onSelect={(categoryId) => {
                              setSavingKey(key);
                              categorize.mutate({
                                sourceSchema: t.sourceSchema,
                                sourceTxnId: t.sourceTxnId,
                                txnDate: t.date.slice(0, 10),
                                categoryId,
                                amount: t.amount,
                              });
                            }}
                          />
                        </div>
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
