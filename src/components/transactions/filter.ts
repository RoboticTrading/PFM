import type { RegisterTxn } from "@/lib/accounts/register-types";
import { toScaled } from "@/lib/money";

export type Direction = "all" | "in" | "out";

export interface TxnFacets {
  /** Case-insensitive substring over description (the payee-ish search). */
  query: string;
  /** Inflows (amount > 0), outflows (< 0), or all. */
  direction: Direction;
  /** Inclusive ISO date lower bound (YYYY-MM-DD), or "". */
  from: string;
  /** Inclusive ISO date upper bound (YYYY-MM-DD), or "". */
  to: string;
  /** "all" | "uncategorized" | a categoryId | the split sentinel. */
  category: string;
}

export const EMPTY_FACETS: TxnFacets = {
  query: "",
  direction: "all",
  from: "",
  to: "",
  category: "all",
};

/** Pure, allocation-light facet filter over register rows. Unit-testable. */
export function filterTransactions(
  rows: readonly RegisterTxn[],
  facets: TxnFacets,
): RegisterTxn[] {
  const q = facets.query.trim().toLowerCase();
  return rows.filter((t) => {
    if (q && !t.description.toLowerCase().includes(q)) return false;

    if (facets.direction !== "all") {
      const scaled = toScaled(t.amount);
      if (facets.direction === "in" && scaled <= 0n) return false;
      if (facets.direction === "out" && scaled >= 0n) return false;
    }

    const day = t.date.slice(0, 10);
    if (facets.from && day < facets.from) return false;
    if (facets.to && day > facets.to) return false;

    if (facets.category === "uncategorized") {
      if (t.categoryId !== null) return false;
    } else if (facets.category !== "all") {
      if (t.categoryId !== facets.category) return false;
    }

    return true;
  });
}
