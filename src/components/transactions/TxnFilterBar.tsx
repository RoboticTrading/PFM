"use client";

import { Input } from "@/components/ui/input";
import { SPLIT_CATEGORY } from "@/lib/accounts/register-types";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

import type { Direction, TxnFacets } from "./filter";
import { EMPTY_FACETS } from "./filter";

const selectClass = cn(
  "h-9 rounded-md border border-input bg-surface px-2 text-sm text-fg outline-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-base",
);

const DIRECTIONS: { value: Direction; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in", label: "Inflows" },
  { value: "out", label: "Outflows" },
];

/** Facet controls for the register: search, direction, date range, category. */
export function TxnFilterBar({
  facets,
  onChange,
  showing,
  total,
}: {
  facets: TxnFacets;
  onChange: (next: TxnFacets) => void;
  showing: number;
  total: number;
}) {
  const categories = trpc.categories.list.useQuery();
  const set = (patch: Partial<TxnFacets>) => onChange({ ...facets, ...patch });
  const dirty = JSON.stringify(facets) !== JSON.stringify(EMPTY_FACETS);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Input
        aria-label="Search description"
        placeholder="Search…"
        value={facets.query}
        onChange={(e) => set({ query: e.target.value })}
        className="h-9 w-44"
      />

      <select
        aria-label="Direction"
        className={selectClass}
        value={facets.direction}
        onChange={(e) => set({ direction: e.target.value as Direction })}
      >
        {DIRECTIONS.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      <Input
        aria-label="From date"
        type="date"
        value={facets.from}
        onChange={(e) => set({ from: e.target.value })}
        className="h-9 w-36"
      />
      <Input
        aria-label="To date"
        type="date"
        value={facets.to}
        onChange={(e) => set({ to: e.target.value })}
        className="h-9 w-36"
      />

      <select
        aria-label="Category"
        className={selectClass}
        value={facets.category}
        onChange={(e) => set({ category: e.target.value })}
      >
        <option value="all">All categories</option>
        <option value="uncategorized">Uncategorized</option>
        <option value={SPLIT_CATEGORY}>Split</option>
        {categories.data?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-3 text-xs text-fg-subtle">
        <span>
          {showing} of {total}
        </span>
        {dirty && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FACETS)}
            className="text-accent hover:text-accent-bright"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
