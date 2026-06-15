"use client";

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const KIND_ORDER = ["Income", "Expense", "Transfer"] as const;

/** Dense category hierarchy, grouped by kind with children under each root. */
export function CategoryTree() {
  const { data, isLoading, isError } = trpc.categories.list.useQuery();

  if (isLoading) return <p className="p-4 text-sm text-fg-muted">Loading…</p>;
  if (isError) return <p className="p-4 text-sm text-danger">Failed to load.</p>;
  if (!data || data.length === 0) {
    return (
      <p className="p-4 text-sm text-fg-muted">
        No categories. Run <code className="font-mono">pnpm db:seed</code>.
      </p>
    );
  }

  const roots = data.filter((c) => c.parentId === null);
  const childrenOf = (id: string) => data.filter((c) => c.parentId === id);

  return (
    <div className="grid gap-4 p-4 sm:grid-cols-3">
      {KIND_ORDER.map((kind) => {
        const kindRoots = roots.filter((r) => r.kind === kind);
        return (
          <section
            key={kind}
            className="rounded-md border border-border bg-surface p-4"
          >
            <h2
              className={cn(
                "mb-2 font-display text-sm font-semibold uppercase tracking-wide",
                kind === "Income"
                  ? "text-success"
                  : kind === "Expense"
                    ? "text-danger"
                    : "text-info",
              )}
            >
              {kind}
            </h2>
            <ul className="space-y-1">
              {kindRoots.map((root) => (
                <li key={root.id}>
                  <div className="text-sm font-medium text-fg">{root.name}</div>
                  <ul className="ml-3 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {childrenOf(root.id).map((child) => (
                      <li key={child.id} className="text-sm text-fg-muted">
                        {child.name}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
