import { eq, inArray } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedCategories } from "@/lib/db/seed";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());
const PERIOD = "2099-07";
const TEST_TXN = "__test_budget_txn";

describeDb("budgets: setBudget + budgetVsActual (live MyDB)", () => {
  afterAll(async () => {
    const db = getDb();
    await db.delete(schema.budget).where(eq(schema.budget.period, PERIOD));
    await db
      .delete(schema.transactionCategory)
      .where(eq(schema.transactionCategory.sourceTxnId, TEST_TXN));
    await db
      .delete(schema.auditLog)
      .where(inArray(schema.auditLog.action, ["setBudget", "categorize"]));
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

  it("computes budget vs actual for the period", async () => {
    await seedCategories(getDb());
    const groceries = await categoryId("Groceries");

    await call.budgets.setBudget({
      categoryId: groceries,
      period: PERIOD,
      amount: "500.00",
    });

    await call.categories.categorize({
      sourceSchema: "schwab_checking",
      sourceTxnId: TEST_TXN,
      txnDate: `${PERIOD}-05`,
      categoryId: groceries,
      amount: "-82.10",
    });

    const rows = await call.budgets.vsActual({ period: PERIOD });
    const groceriesRow = rows.find((r) => r.categoryId === groceries);
    expect(groceriesRow).toBeDefined();
    expect(groceriesRow?.budget).toBe("500.0000");
    expect(groceriesRow?.actual).toBe("-82.1000");
    // variance = budget − actual = 500 − (−82.10) = 582.10
    expect(groceriesRow?.variance).toBe("582.1000");
  });

  it("setBudget upserts the amount for the same category+period", async () => {
    const groceries = await categoryId("Groceries");
    await call.budgets.setBudget({
      categoryId: groceries,
      period: PERIOD,
      amount: "600.00",
    });
    const rows = await call.budgets.vsActual({ period: PERIOD });
    expect(rows.find((r) => r.categoryId === groceries)?.budget).toBe(
      "600.0000",
    );
  });

  it("excludes a different period's actuals", async () => {
    const rows = await call.budgets.vsActual({ period: "2098-01" });
    expect(rows).toHaveLength(0);
  });
});
