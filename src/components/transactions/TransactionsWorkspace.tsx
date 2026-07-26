"use client";

import { keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { CategoryPicker } from "@/components/categories/CategoryPicker";
import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";
import { formatUsd } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import { DEFAULT_FACETS, type TxnFacets } from "./filter";
import { SplitDialog, type SplitTarget } from "./SplitDialog";
import { TxnFilterBar } from "./TxnFilterBar";

const PAGE_SIZE = 200;

/**
 * Transactions workspace — pick an account (or all), filter the register, and
 * categorize inline. Filtering + the uncategorized burn-down run SERVER-side
 * against the unified `cube.v_ledger` (LEFT-joined to the categorizations), so
 * paging spans the FULL history and the "M uncategorized" count is real — not a
 * client-side tally of a loaded window. The category control is a searchable
 * tree picker backed by `categories.categorize` (replaces any prior
 * categorization; lineage by source_txn_id, never copied).
 *
 * Selection is intentionally PER PAGE: the header checkbox selects only the rows
 * currently visible (≤ one page ≤ 200, safely under the bulk cap). There is no
 * "select all N matching across pages" — that would risk a silent mass-assign
 * over thousands of rows. To categorize a large set, page through and apply.
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
  // Open on the burn-down — only what's still uncategorized (DEFAULT_FACETS).
  const [facets, setFacets] = useState<TxnFacets>(DEFAULT_FACETS);
  const [offset, setOffset] = useState(0);

  // The facet filter as the server query shape — shared by the paged register and
  // the "select all matching" ref-gather, so the two can never drift apart.
  const queryInput = {
    accountId,
    category: facets.category,
    query: facets.query,
    direction: facets.direction,
    from: facets.from,
    to: facets.to,
  };

  const register = trpc.transactions.page.useQuery(
    { ...queryInput, limit: PAGE_SIZE, offset },
    { enabled: accountId !== "", placeholderData: keepPreviousData },
  );

  const utils = trpc.useUtils();
  const invalidateRegister = () => void utils.transactions.page.invalidate();

  const rows = useMemo(() => register.data?.rows ?? [], [register.data]);
  const total = register.data?.total ?? 0;
  const uncategorized = register.data?.uncategorized ?? 0;

  // Reset paging whenever the filter set or account changes — the old offset
  // is meaningless against a different result set.
  useEffect(() => {
    setOffset(0);
  }, [accountId, facets]);

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [splitTarget, setSplitTarget] = useState<SplitTarget | null>(null);
  const categorize = trpc.categories.categorize.useMutation({
    onSettled: () => {
      invalidateRegister();
      setSavingKey(null);
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState<string | null>(null);
  // A transient "✓ N categorized as X" confirmation after a bulk apply. Needed
  // because a successful apply clears the selection (unmounting the bulk bar) and
  // — on the default uncategorized view — drops the rows out, so without this the
  // action can feel like it did nothing.
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(id);
  }, [flash]);

  // The search box, so an apply can clear it and refocus — landing ready for the
  // next merchant filter without clobbering the date window or the Uncategorized
  // scope (those persist across batches; only the per-merchant search resets).
  const searchRef = useRef<HTMLInputElement>(null);
  // "Select all N matching this filter" — the escape hatch from per-page (≤200)
  // selection. The filter is the scope, so applying to the whole matching set is
  // explicit and safe; refs are gathered server-side, not from the loaded page.
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const bulk = trpc.categories.categorizeBulk.useMutation();

  const keyOf = (t: { sourceSchema: string; sourceTxnId: string }) =>
    `${t.sourceSchema}:${t.sourceTxnId}`;

  // Selection is scoped to the visible page; drop any keys no longer on it.
  const visibleKeys = useMemo(() => new Set(rows.map(keyOf)), [rows]);
  const selectedVisible = useMemo(
    () => [...selected].filter((k) => visibleKeys.has(k)),
    [selected, visibleKeys],
  );

  // A new filter/account invalidates any prior selection and the all-matching scope.
  useEffect(() => {
    setSelected(new Set());
    setSelectAllMatching(false);
  }, [accountId, facets]);

  // How many rows the pending apply will hit.
  const applyCount = selectAllMatching ? total : selectedVisible.length;

  function toggleRow(key: string) {
    setSelectAllMatching(false);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function applyBulk() {
    if (!bulkCategory || applying) return;
    const categoryId = bulkCategory;
    const name =
      categories.data?.find((c) => c.id === categoryId)?.name ?? "category";

    // Gather targets: the WHOLE matching filter (server-side), or just the page
    // selection. Either way, hand plain write-refs to categorizeBulk.
    let refs: {
      sourceSchema: string;
      sourceTxnId: string;
      txnDate: string;
      amount: string;
    }[];
    let capped = false;
    if (selectAllMatching) {
      const res = await utils.transactions.matchingRefs.fetch(queryInput);
      refs = res.refs;
      capped = res.capped;
    } else {
      const chosen = new Set(selectedVisible);
      refs = rows
        .filter((t) => chosen.has(keyOf(t)))
        .map((t) => ({
          sourceSchema: t.sourceSchema,
          sourceTxnId: t.sourceTxnId,
          txnDate: t.date.slice(0, 10),
          amount: t.amount,
        }));
    }
    if (refs.length === 0) return;

    // categorizeBulk caps at 1000/call — chunk a larger "select all" set.
    setApplying(true);
    try {
      const CHUNK = 1000;
      for (let i = 0; i < refs.length; i += CHUNK) {
        await bulk.mutateAsync({ categoryId, txns: refs.slice(i, i + CHUNK) });
      }
    } catch {
      setApplying(false);
      return; // leave the selection intact so the user can retry
    }
    setApplying(false);

    setFlash(
      `✓ ${refs.length} categorized as ${name}` +
        (capped ? " · filter ceiling hit — narrow it for the rest" : ""),
    );
    invalidateRegister();
    setSelected(new Set());
    setSelectAllMatching(false);
    setBulkCategory(null);
    setFacets((f) => ({ ...f, query: "" }));
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  const pickerCats = categories.data ?? [];
  const uncategorizedActive = facets.category === "uncategorized";

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = offset + rows.length;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <main className="px-8 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-wide text-accent">
            Transactions
          </h1>
          <p className="text-sm text-fg-muted">
            Categorize the ledger · {total} match
            {total === 1 ? "" : "es"}
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

      {flash && (
        <div
          role="status"
          className="mb-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-medium text-accent-bright"
        >
          {flash}
        </div>
      )}

      {(selectedVisible.length > 0 || selectAllMatching) && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3">
          <span className="text-sm font-medium text-fg">
            {selectAllMatching
              ? `All ${total} matching selected`
              : `${selectedVisible.length} selected`}
          </span>

          {/* Escape hatch from the per-page cap: grab every match, not just the
              visible page. Offered whenever the filter has more than one page. */}
          {!selectAllMatching && total > rows.length && (
            <button
              type="button"
              onClick={() => setSelectAllMatching(true)}
              className="text-sm text-accent outline-none hover:text-accent-bright focus-visible:underline"
            >
              Select all {total} matching this filter
            </button>
          )}
          {selectAllMatching && (
            <button
              type="button"
              onClick={() => {
                setSelectAllMatching(false);
                setSelected(new Set());
              }}
              className="text-sm text-fg-muted outline-none hover:text-fg"
            >
              select page only
            </button>
          )}

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
            disabled={!bulkCategory || applying || applyCount === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {applying ? "Applying…" : `Apply to ${applyCount}`}
          </button>
          <button
            type="button"
            onClick={() => {
              setSelected(new Set());
              setSelectAllMatching(false);
            }}
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
          showing={rows.length}
          total={total}
          defaults={DEFAULT_FACETS}
          searchRef={searchRef}
        />
        {register.isLoading ? (
          <p className="p-4 text-sm text-fg-muted">Loading transactions…</p>
        ) : register.isError ? (
          <p className="p-4 text-sm text-danger">Failed to load transactions.</p>
        ) : rows.length === 0 ? (
          uncategorizedActive ? (
            <p className="p-4 text-sm text-accent-bright">
              ✓ All caught up — nothing uncategorized
              {facets.query || facets.from || facets.to || facets.direction !== "all"
                ? " in this filter."
                : "."}
            </p>
          ) : (
            <p className="p-4 text-sm text-fg-muted">
              No transactions match these filters.
            </p>
          )
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-wide text-fg-subtle">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    title="Select all on this page"
                    checked={
                      selectAllMatching ||
                      (rows.length > 0 &&
                        selectedVisible.length === rows.length)
                    }
                    onChange={(e) => {
                      setSelectAllMatching(false);
                      setSelected(
                        e.target.checked
                          ? new Set(rows.map(keyOf))
                          : new Set(),
                      );
                    }}
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
                const key = keyOf(t);
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
        {total > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs text-fg-subtle">
            <span>
              {pageStart}–{pageEnd} of {total}
              {register.isFetching && " · updating…"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOffset((o) => Math.max(o - PAGE_SIZE, 0))}
                disabled={!hasPrev}
                className="rounded-md border border-border px-2 py-1 outline-none hover:text-fg disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={!hasNext}
                className="rounded-md border border-border px-2 py-1 outline-none hover:text-fg disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      {(categorize.isError || bulk.isError) && (
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
