import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
// Self-provisioned category fixtures (unique names never collide with the
// owner's real tree, and are cleaned up in afterAll). Seeds are roots-only, so
// sub-categories must be created by the test — not assumed to exist.
const TEST_CATS = ["__test_Groceries", "__test_Dining"] as const;

describe("categories.suggest (AI off by default, no DB)", () => {
  it("returns enabled:false without touching the DB or network", async () => {
    const res = await call.categories.suggest({
      description: "WHOLE FOODS",
      amount: "-82.10",
    });
    expect(res.enabled).toBe(false);
    expect(res.suggestion).toBeNull();
  });
});

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
  beforeAll(async () => {
    const db = getDb();
    // Roots only (seed no longer creates sub-categories).
    await seedCategories(db);
    // Start clean, then create this suite's own sub-categories under Expense.
    await db
      .delete(schema.category)
      .where(inArray(schema.category.name, [...TEST_CATS]));
    const [expense] = await db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Expense"))
      .limit(1);
    for (const name of TEST_CATS) {
      await call.categories.create({
        name,
        kind: "Expense",
        parentId: expense.id,
      });
    }
  });

  afterAll(async () => {
    const db = getDb();
    await db
      .delete(schema.transactionCategory)
      .where(eq(schema.transactionCategory.sourceTxnId, TEST_TXN));
    await db
      .delete(schema.category)
      .where(inArray(schema.category.name, [...TEST_CATS]));
    await db
      .delete(schema.auditLog)
      .where(
        inArray(schema.auditLog.action, [
          "categorize",
          "splitTransaction",
          "createCategory",
        ]),
      );
    // Connection is closed by the last describeDb block in this file.
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
    const groceries = await categoryId("__test_Groceries");

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
    expect(links[0].categoryName).toBe("__test_Groceries");
    expect(sumMoney([links[0].amount])).toBe("-82.1000");
  });

  it("re-categorize replaces the prior categorization (still one row)", async () => {
    const dining = await categoryId("__test_Dining");
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
    expect(links[0].categoryName).toBe("__test_Dining");
  });

  it("splitTransaction records splits that sum to the total", async () => {
    const groceries = await categoryId("__test_Groceries");
    const dining = await categoryId("__test_Dining");

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

const REPARENT_CATS = [
  "__test_Reparent_A",
  "__test_Reparent_A_child",
  "__test_Reparent_B",
] as const;

describeDb("setParent — re-parent / nest (live MyDB)", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const db = getDb();
    await seedCategories(db);
    await db
      .delete(schema.category)
      .where(inArray(schema.category.name, [...REPARENT_CATS]));
    const [expense] = await db
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Expense"))
      .limit(1);
    const a = await call.categories.create({
      name: "__test_Reparent_A",
      kind: "Expense",
      parentId: expense.id,
    });
    ids.a = a.id;
    const aChild = await call.categories.create({
      name: "__test_Reparent_A_child",
      kind: "Expense",
      parentId: a.id,
    });
    ids.aChild = aChild.id;
    const b = await call.categories.create({
      name: "__test_Reparent_B",
      kind: "Expense",
      parentId: expense.id,
    });
    ids.b = b.id;
  });

  afterAll(async () => {
    const db = getDb();
    // Children must go before parents (FK on parent_id).
    await db
      .delete(schema.category)
      .where(eq(schema.category.id, ids.aChild));
    await db
      .delete(schema.category)
      .where(inArray(schema.category.id, [ids.a, ids.b]));
    await db
      .delete(schema.auditLog)
      .where(
        inArray(schema.auditLog.action, ["createCategory", "setParentCategory"]),
      );
    await getSql().end({ timeout: 5 });
  });

  async function kindOf(id: string): Promise<string> {
    const [c] = await getDb()
      .select({ kind: schema.category.kind })
      .from(schema.category)
      .where(eq(schema.category.id, id))
      .limit(1);
    return c.kind;
  }

  it("re-parents under a new root and cascades kind to the subtree", async () => {
    const [income] = await getDb()
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Income"))
      .limit(1);

    await call.categories.setParent({ id: ids.a, parentId: income.id });

    expect(await kindOf(ids.a)).toBe("Income");
    // The whole subtree follows the new parent's kind.
    expect(await kindOf(ids.aChild)).toBe("Income");

    // Move it back under Expense so cleanup order is simple.
    const [expense] = await getDb()
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Expense"))
      .limit(1);
    await call.categories.setParent({ id: ids.a, parentId: expense.id });
    expect(await kindOf(ids.a)).toBe("Expense");
    expect(await kindOf(ids.aChild)).toBe("Expense");
  });

  it("refuses to nest a node under its own descendant (cycle guard)", async () => {
    await expect(
      call.categories.setParent({ id: ids.a, parentId: ids.aChild }),
    ).rejects.toThrow(/descendant/i);
  });

  it("refuses to move a fixed kind-root", async () => {
    const [income] = await getDb()
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Income"))
      .limit(1);
    const [expense] = await getDb()
      .select({ id: schema.category.id })
      .from(schema.category)
      .where(eq(schema.category.name, "Expense"))
      .limit(1);
    await expect(
      call.categories.setParent({ id: income.id, parentId: expense.id }),
    ).rejects.toThrow(/fixed/i);
  });
});
