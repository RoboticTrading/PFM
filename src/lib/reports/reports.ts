import { and, asc, eq, gte, lte, sql } from "drizzle-orm";

import { accountBalance } from "@/lib/accounts/balance";
import { getDb, schema } from "@/lib/db";
import { sumMoney } from "@/lib/money";

export interface DateRange {
  /** Inclusive ISO start (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO end (YYYY-MM-DD). */
  to: string;
}

export interface CategoryReportRow {
  categoryId: string;
  categoryName: string;
  kind: string;
  total: string;
}

/** Σ of categorized amounts per category over a date range (by txn_date). */
export async function categoryReport(
  range: DateRange,
): Promise<CategoryReportRow[]> {
  return getDb()
    .select({
      categoryId: schema.transactionCategory.categoryId,
      categoryName: schema.category.name,
      kind: schema.category.kind,
      total: sql<string>`sum(${schema.transactionCategory.amount})::text`,
    })
    .from(schema.transactionCategory)
    .innerJoin(
      schema.category,
      eq(schema.transactionCategory.categoryId, schema.category.id),
    )
    .where(
      and(
        gte(schema.transactionCategory.txnDate, range.from),
        lte(schema.transactionCategory.txnDate, range.to),
      ),
    )
    .groupBy(
      schema.transactionCategory.categoryId,
      schema.category.name,
      schema.category.kind,
    )
    .orderBy(asc(schema.category.name));
}

export interface CashFlow {
  range: DateRange;
  income: string;
  expense: string;
  transfer: string;
  /** income + expense + transfer (expenses are negative). */
  net: string;
}

/** Income vs expense (and transfers) over a range, from categorizations. */
export async function cashFlow(range: DateRange): Promise<CashFlow> {
  const rows = await getDb()
    .select({
      kind: schema.category.kind,
      total: sql<string>`sum(${schema.transactionCategory.amount})::text`,
    })
    .from(schema.transactionCategory)
    .innerJoin(
      schema.category,
      eq(schema.transactionCategory.categoryId, schema.category.id),
    )
    .where(
      and(
        gte(schema.transactionCategory.txnDate, range.from),
        lte(schema.transactionCategory.txnDate, range.to),
      ),
    )
    .groupBy(schema.category.kind);

  const byKind = new Map(rows.map((r) => [r.kind, r.total]));
  const income = byKind.get("Income") ?? "0";
  const expense = byKind.get("Expense") ?? "0";
  const transfer = byKind.get("Transfer") ?? "0";
  return {
    range,
    income: sumMoney([income]),
    expense: sumMoney([expense]),
    transfer: sumMoney([transfer]),
    net: sumMoney([income, expense, transfer]),
  };
}

export interface NetWorth {
  total: string;
  byAccount: { accountId: string; name: string; balance: string }[];
}

/** Σ of every account's current balance (balanceForward + Σ since). */
export async function netWorth(): Promise<NetWorth> {
  const accounts = await getDb()
    .select({ id: schema.account.id, name: schema.account.name })
    .from(schema.account)
    .where(eq(schema.account.active, true))
    .orderBy(asc(schema.account.name));

  const byAccount = await Promise.all(
    accounts.map(async (a) => ({
      accountId: a.id,
      name: a.name,
      balance: (await accountBalance(a.id)).balance,
    })),
  );

  return {
    total: sumMoney(byAccount.map((b) => b.balance)),
    byAccount,
  };
}
