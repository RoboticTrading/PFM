"use client";

import { useMemo, useState } from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CanonicalTxn } from "@/lib/db/read-models";
import { formatUsd, toScaled } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export type SortKey = "date" | "description" | "amount";
export type SortDir = "asc" | "desc";

/** Pure, stable sort of canonical transactions — unit-testable without render. */
export function sortTransactions(
  rows: readonly CanonicalTxn[],
  key: SortKey,
  dir: SortDir,
): CanonicalTxn[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp: number;
    if (key === "amount") {
      const d = toScaled(a.amount) - toScaled(b.amount);
      cmp = d < 0n ? -1 : d > 0n ? 1 : 0;
    } else if (key === "date") {
      cmp = a.date.localeCompare(b.date);
    } else {
      cmp = a.description.localeCompare(b.description);
    }
    return cmp * factor;
  });
}

function SortHeader({
  label,
  col,
  sort,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === col;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide outline-none transition-colors hover:text-fg focus-visible:text-fg",
          active ? "text-accent" : "text-fg-muted",
        )}
      >
        {label}
        {active && <span aria-hidden>{sort.dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </TableHead>
  );
}

/**
 * Quicken-style transaction register over an account's source read-model. Dense,
 * sortable, mono amounts (negative in red). Read-only; rows reference the source
 * txn (lineage) and are never copied.
 */
export function TransactionRegister({
  accountId,
  limit = 200,
}: {
  accountId: string;
  limit?: number;
}) {
  const { data, isLoading, isError } = trpc.transactions.forAccount.useQuery({
    accountId,
    limit,
  });
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "date",
    dir: "desc",
  });

  const rows = useMemo(
    () => (data ? sortTransactions(data, sort.key, sort.dir) : []),
    [data, sort],
  );

  function onSort(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "amount" || key === "date" ? "desc" : "asc" },
    );
  }

  if (isLoading) {
    return <p className="p-4 text-sm text-fg-muted">Loading transactions…</p>;
  }
  if (isError) {
    return <p className="p-4 text-sm text-danger">Failed to load transactions.</p>;
  }
  if (rows.length === 0) {
    return <p className="p-4 text-sm text-fg-muted">No transactions.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortHeader label="Date" col="date" sort={sort} onSort={onSort} className="w-32" />
          <SortHeader label="Description" col="description" sort={sort} onSort={onSort} />
          <TableHead className="w-20">Symbol</TableHead>
          <SortHeader
            label="Amount"
            col="amount"
            sort={sort}
            onSort={onSort}
            className="w-36 text-right"
          />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((t) => {
          const negative = t.amount.startsWith("-");
          return (
            <TableRow key={`${t.sourceSchema}:${t.sourceTxnId}`}>
              <TableCell className="font-mono text-xs text-fg-muted">
                {t.date.slice(0, 10)}
              </TableCell>
              <TableCell className="text-fg">{t.description}</TableCell>
              <TableCell className="font-mono text-xs text-fg-subtle">
                {t.symbol ?? ""}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-mono text-sm tabular-nums",
                  negative ? "text-danger" : "text-fg",
                )}
              >
                {formatUsd(t.amount)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
