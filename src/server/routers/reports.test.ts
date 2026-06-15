import { eq, inArray } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedAccounts, seedCategories } from "@/lib/db/seed";
import { sumMoney } from "@/lib/money";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());
// A far-future range that only this test's synthetic categorizations fall in.
const RANGE = { from: "2099-08-01", to: "2099-08-31" };
const TXNS = ["__test_report_income", "__test_report_expense"];

describeDb("reports: categoryReport / cashFlow / netWorth (live MyDB)", () => {
  afterAll(async () => {
    const db = getDb();
    await db
      .delete(schema.transactionCategory)
      .where(inArray(schema.transactionCategory.sourceTxnId, TXNS));
    await db
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.action, "categorize"));
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

  it("categoryReport + cashFlow are decimal-correct over the range", async () => {
    await seedCategories(getDb());
    const salary = await categoryId("Salary");
    const groceries = await categoryId("Groceries");

    await call.categories.categorize({
      sourceSchema: "schwab_checking",
      sourceTxnId: TXNS[0],
      txnDate: "2099-08-10",
      categoryId: salary,
      amount: "1000.00",
    });
    await call.categories.categorize({
      sourceSchema: "schwab_checking",
      sourceTxnId: TXNS[1],
      txnDate: "2099-08-12",
      categoryId: groceries,
      amount: "-200.00",
    });

    const report = await call.reports.categoryReport(RANGE);
    expect(report.find((r) => r.categoryId === salary)?.total).toBe("1000.0000");
    expect(report.find((r) => r.categoryId === groceries)?.total).toBe(
      "-200.0000",
    );

    const flow = await call.reports.cashFlow(RANGE);
    expect(flow.income).toBe("1000.0000");
    expect(flow.expense).toBe("-200.0000");
    expect(flow.net).toBe("800.0000");
  });

  it("netWorth totals equal the sum of per-account balances", async () => {
    await seedAccounts(getDb());
    const nw = await call.reports.netWorth();
    expect(nw.byAccount.length).toBeGreaterThan(0);
    expect(nw.total).toBe(sumMoney(nw.byAccount.map((b) => b.balance)));
  });
});
