"use client";

import { useMemo, useState } from "react";

import { formatUsd, fromScaled, sumMoney, toScaled } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const MONEY_RE = /^-?\d+(\.\d+)?$/;

export interface SplitTarget {
  sourceSchema: string;
  sourceTxnId: string;
  txnDate: string; // YYYY-MM-DD
  total: string;
  description: string;
}

interface CategoryOption {
  id: string;
  name: string;
  kind: string;
}

interface SplitRow {
  categoryId: string;
  amount: string;
}

/** Split a transaction across ≥2 categories whose amounts sum to the total.
 *  Wraps `categories.splitTransaction` (replaces any prior categorization). */
export function SplitDialog({
  target,
  categories,
  onClose,
}: {
  target: SplitTarget;
  categories: CategoryOption[];
  onClose: () => void;
}) {
  const [rows, setRows] = useState<SplitRow[]>([
    { categoryId: "", amount: "" },
    { categoryId: "", amount: "" },
  ]);

  const utils = trpc.useUtils();
  const split = trpc.categories.splitTransaction.useMutation({
    onSuccess: () => {
      void utils.transactions.forAccount.invalidate();
      onClose();
    },
  });

  const amounts = rows.map((r) => r.amount.trim());
  const allAmountsValid = amounts.every((a) => MONEY_RE.test(a));
  const sum = useMemo(
    () => (allAmountsValid ? sumMoney(amounts) : "0"),
    [allAmountsValid, amounts],
  );
  const remainder = allAmountsValid ? toScaled(target.total) - toScaled(sum) : 1n;
  const valid =
    rows.length >= 2 &&
    rows.every((r) => r.categoryId !== "" && MONEY_RE.test(r.amount.trim())) &&
    remainder === 0n;

  function setRow(i: number, patch: Partial<SplitRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-fg-subtle">
          Split transaction
        </div>
        <p className="mb-4 text-sm text-fg">
          {target.description}{" "}
          <span className="font-mono text-fg-muted">· {formatUsd(target.total)}</span>
        </p>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={r.categoryId}
                onChange={(e) => setRow(i, { categoryId: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-border bg-base px-2 py-1.5 text-sm text-fg outline-none focus-visible:border-accent"
              >
                <option value="">Select category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.kind} · {c.name}
                  </option>
                ))}
              </select>
              <input
                value={r.amount}
                onChange={(e) => setRow(i, { amount: e.target.value })}
                inputMode="decimal"
                placeholder="0.00"
                className="w-28 rounded-md border border-border bg-base px-2 py-1.5 text-right font-mono text-sm text-fg outline-none focus-visible:border-accent"
              />
              {rows.length > 2 && (
                <button
                  type="button"
                  aria-label="Remove split"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="px-1 text-fg-muted outline-none hover:text-danger"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { categoryId: "", amount: "" }])}
          className="mt-2 text-xs text-accent outline-none hover:text-accent-bright"
        >
          + Add split
        </button>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-sm">
          <span className="text-fg-muted">
            Sum {allAmountsValid ? formatUsd(sum) : "—"} of {formatUsd(target.total)}
          </span>
          <span
            className={cn(
              "font-mono tabular-nums",
              remainder === 0n ? "text-success" : "text-danger",
            )}
          >
            {remainder === 0n ? "balanced" : "off by " + formatUsd(fromScaled(remainder))}
          </span>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-fg-muted outline-none hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || split.isPending}
            onClick={() =>
              split.mutate({
                sourceSchema: target.sourceSchema,
                sourceTxnId: target.sourceTxnId,
                txnDate: target.txnDate,
                total: target.total,
                splits: rows.map((r) => ({
                  categoryId: r.categoryId,
                  amount: r.amount.trim(),
                })),
              })
            }
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-bright disabled:opacity-40"
          >
            {split.isPending ? "Saving…" : "Save split"}
          </button>
        </div>
        {split.isError && (
          <p className="mt-2 text-right text-sm text-danger">
            Couldn’t save — splits must sum to the total.
          </p>
        )}
      </div>
    </div>
  );
}
