import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("transactions.forAccount (live MyDB, cube.v_ledger)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("returns canonical ledger transactions for a cube account_key", async () => {
    const txns = await call.transactions.forAccount({
      accountId: "schwab_checking",
      limit: 10,
    });
    expect(Array.isArray(txns)).toBe(true);
    for (const t of txns) {
      expect(typeof t.sourceSchema).toBe("string");
      expect(t.sourceSchema.length).toBeGreaterThan(0);
      expect(typeof t.sourceTxnId).toBe("string");
      expect(typeof t.amount).toBe("string");
    }
  });

  it("streams every account unified via the ALL_ACCOUNTS sentinel", async () => {
    const txns = await call.transactions.forAccount({
      accountId: ALL_ACCOUNTS,
      limit: 50,
    });
    expect(Array.isArray(txns)).toBe(true);
    // Unified stream spans more than one source schema (cards + checking + brokerage).
    const schemas = new Set(txns.map((t) => t.sourceSchema));
    expect(schemas.size).toBeGreaterThan(1);
  });

  it("drops a txn from the uncategorized set + count when it's categorized", async () => {
    // A real category to assign (schema seeds Income / Expense / Transfer roots).
    const cats = await call.categories.list();
    expect(cats.length).toBeGreaterThan(0);
    const categoryId = cats[0].id;

    const keyOf = (r: { sourceSchema: string; sourceTxnId: string }) =>
      `${r.sourceSchema}:${r.sourceTxnId}`;

    // Baseline: the newest uncategorized rows + the FULL-history uncategorized
    // count (the burn-down target the header shows).
    const before = await call.transactions.page({
      accountId: ALL_ACCOUNTS,
      category: "uncategorized",
      limit: 5,
    });
    expect(before.uncategorized).toBeGreaterThan(0);
    expect(before.rows.length).toBeGreaterThan(0);
    const target = before.rows[0];
    const key = keyOf(target);
    expect(before.rows.some((r) => keyOf(r) === key)).toBe(true);

    // Categorize it (a marked `__test_` link so cleanup is unambiguous).
    const [link] = await getDb()
      .insert(schema.transactionCategory)
      .values({
        sourceSchema: target.sourceSchema,
        sourceTxnId: target.sourceTxnId,
        txnDate: target.date.slice(0, 10),
        categoryId,
        amount: target.amount,
        note: "__test_uncategorized_filter",
      })
      .returning({ id: schema.transactionCategory.id });

    try {
      const after = await call.transactions.page({
        accountId: ALL_ACCOUNTS,
        category: "uncategorized",
        limit: 5,
      });
      // It left the uncategorized set …
      expect(after.rows.some((r) => keyOf(r) === key)).toBe(false);
      // … and the full-history count dropped by exactly one.
      expect(after.uncategorized).toBe(before.uncategorized - 1);

      // … and it now surfaces under the "categorized" filter (same lineage key).
      const categorized = await call.transactions.page({
        accountId: ALL_ACCOUNTS,
        category: "categorized",
        limit: 50,
      });
      expect(categorized.rows.some((r) => keyOf(r) === key)).toBe(true);
    } finally {
      // Clean up — leave MyDB exactly as we found it.
      await getDb()
        .delete(schema.transactionCategory)
        .where(eq(schema.transactionCategory.id, link.id));
    }
  });
});
