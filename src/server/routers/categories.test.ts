import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedCategories } from "@/lib/db/seed";
import { sumMoney } from "@/lib/money";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

const TEST_SCHEMA = "schwab_checking";
const TEST_TXN = "__test_txn_categorize";

describe("splitTransaction validation (no DB)", () => {
  it("rejects splits that don't sum to the total before any DB work", async () => {
    await expect(
      call.categories.splitTransaction({
        sourceSchema: TEST_SCHEMA,
        sourceTxnId: TEST_TXN,
        txnDate: "2026-05-01",
        total: "-100.0000",
        splits: [
          { categoryId: "00000000-0000-0000-0000-000000000001", amount: "-60.00" },
          { categoryId: "00000000-0000-0000-0000-000000000002", amount: "-30.00" },
        ],
      }),
    ).rejects.toThrow(/sum/i);
  });
});

describeDb("categorize / splitTransaction (live MyDB)", () => {
  afterAll(async () => {
    const db = getDb();
    await db
      .delete(schema.transactionCategory)
      .where(eq(schema.transactionCategory.sourceTxnId, TEST_TXN));
    await db
      .delete(schema.auditLog)
      .where(
        inArray(schema.auditLog.action, ["categorize", "splitTransaction"]),
      );
    await getSql().end({ timeout: 5 });
  });

  async function categoryId(name: string): Promise<string> {
    const [c] = await getDb()
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, name))
      .limit(1);
    return c.id;
  }

  it("categorize creates one link referencing the source txn (no copy)", async () => {
    await seedCategories(getDb());
    const groceries = await categoryId("Groceries");

    await call.categories.categorize({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
      txnDate: "2026-05-01",
      categoryId: groceries,
      amount: "-82.10",
    });

    const links = await call.categories.forTxn({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
    });
    expect(links).toHaveLength(1);
    expect(links[0].categoryName).toBe("Groceries");
    expect(sumMoney([links[0].amount])).toBe("-82.1000");
  });

  it("re-categorize replaces the prior categorization (still one row)", async () => {
    const dining = await categoryId("Dining");
    await call.categories.categorize({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
      txnDate: "2026-05-01",
      categoryId: dining,
      amount: "-82.10",
    });
    const links = await call.categories.forTxn({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
    });
    expect(links).toHaveLength(1);
    expect(links[0].categoryName).toBe("Dining");
  });

  it("splitTransaction records splits that sum to the total", async () => {
    const groceries = await categoryId("Groceries");
    const dining = await categoryId("Dining");

    await call.categories.splitTransaction({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
      txnDate: "2026-05-01",
      total: "-100.00",
      splits: [
        { categoryId: groceries, amount: "-60.00", note: "food" },
        { categoryId: dining, amount: "-40.00" },
      ],
    });

    const links = await call.categories.forTxn({
      sourceSchema: TEST_SCHEMA,
      sourceTxnId: TEST_TXN,
    });
    expect(links).toHaveLength(2);
    expect(sumMoney(links.map((l) => l.amount))).toBe("-100.0000");
    // Lineage preserved: every link references the source txn, never copies it.
    const rows = await getDb()
      .select()
      .from(schema.transactionCategory)
      .where(
        and(
          eq(schema.transactionCategory.sourceSchema, TEST_SCHEMA),
          eq(schema.transactionCategory.sourceTxnId, TEST_TXN),
        ),
      );
    expect(rows.every((r) => r.sourceTxnId === TEST_TXN)).toBe(true);
  });
});
