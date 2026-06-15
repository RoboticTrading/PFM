import { eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { subMoney } from "@/lib/money";

export interface BudgetVsActualRow {
  categoryId: string;
  categoryName: string;
  kind: string;
  period: string;
  /** Budgeted target (as entered). */
  budget: string;
  /** Signed sum of categorizations whose txn_date falls in the period. */
  actual: string;
  /** budget − actual. */
  variance: string;
}

/**
 * Budget vs actual for a period ("YYYY" or "YYYY-MM"). Actuals sum the
 * categorization links (`transaction_category.amount`) whose `txn_date` falls in
 * the period — computed from the links, lineage intact.
 */
export async function budgetVsActual(
  period: string,
): Promise<BudgetVsActualRow[]> {
  const db = getDb();

  const budgets = await db
    .select({
      categoryId: schema.budget.categoryId,
      categoryName: schema.category.name,
      kind: schema.category.kind,
      amount: schema.budget.amount,
    })
    .from(schema.budget)
    .innerJoin(
      schema.category,
      eq(schema.budget.categoryId, schema.category.id),
    )
    .where(eq(schema.budget.period, period));

  const actuals = await db
    .select({
      categoryId: schema.transactionCategory.categoryId,
      total: sql<string>`coalesce(sum(${schema.transactionCategory.amount}), 0)::text`,
    })
    .from(schema.transactionCategory)
    .where(
      sql`${schema.transactionCategory.txnDate}::text like ${`${period}%`}`,
    )
    .groupBy(schema.transactionCategory.categoryId);

  const actualByCategory = new Map(actuals.map((a) => [a.categoryId, a.total]));

  return budgets.map((b) => {
    const actual = actualByCategory.get(b.categoryId) ?? "0";
    return {
      categoryId: b.categoryId,
      categoryName: b.categoryName,
      kind: b.kind,
      period,
      budget: b.amount,
      actual,
      variance: subMoney(b.amount, actual),
    };
  });
}
