import { describe, expect, it } from "vitest";

import type { RegisterTxn } from "@/lib/accounts/register";

import { EMPTY_FACETS, filterTransactions } from "./filter";

const make = (over: Partial<RegisterTxn>): RegisterTxn => ({
  sourceSchema: "schwab_checking",
  sourceView: "v_transactions",
  sourceTxnId: "x",
  date: "2026-05-10",
  description: "Thing",
  amount: "-10.00",
  categoryId: null,
  categoryName: null,
  ...over,
});

const ROWS: RegisterTxn[] = [
  make({ sourceTxnId: "1", description: "Paycheck", amount: "2500.00", date: "2026-05-10", categoryId: "cat-income", categoryName: "Salary" }),
  make({ sourceTxnId: "2", description: "Whole Foods", amount: "-82.10", date: "2026-05-01" }),
  make({ sourceTxnId: "3", description: "Amazon order", amount: "-19.99", date: "2026-05-20", categoryId: "cat-shop", categoryName: "Shopping" }),
];

describe("filterTransactions", () => {
  it("passes everything with empty facets", () => {
    expect(filterTransactions(ROWS, EMPTY_FACETS)).toHaveLength(3);
  });

  it("filters by case-insensitive description search", () => {
    const r = filterTransactions(ROWS, { ...EMPTY_FACETS, query: "AMAZON" });
    expect(r.map((x) => x.sourceTxnId)).toEqual(["3"]);
  });

  it("filters by direction (inflows vs outflows)", () => {
    expect(filterTransactions(ROWS, { ...EMPTY_FACETS, direction: "in" })).toHaveLength(1);
    expect(filterTransactions(ROWS, { ...EMPTY_FACETS, direction: "out" })).toHaveLength(2);
  });

  it("filters by inclusive date range", () => {
    const r = filterTransactions(ROWS, {
      ...EMPTY_FACETS,
      from: "2026-05-05",
      to: "2026-05-15",
    });
    expect(r.map((x) => x.sourceTxnId)).toEqual(["1"]);
  });

  it("filters by category and uncategorized", () => {
    expect(
      filterTransactions(ROWS, { ...EMPTY_FACETS, category: "cat-shop" }),
    ).toHaveLength(1);
    expect(
      filterTransactions(ROWS, { ...EMPTY_FACETS, category: "uncategorized" }),
    ).toHaveLength(1);
  });
});
