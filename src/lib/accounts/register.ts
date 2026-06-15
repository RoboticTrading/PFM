import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

import { accountTransactions } from "./transactions";
import { SPLIT_CATEGORY, type RegisterTxn } from "./register-types";

export { SPLIT_CATEGORY, type RegisterTxn } from "./register-types";

/**
 * An account's transactions (canonical, RO) joined with their categorization by
 * `source_txn_id`. Lineage intact — the join references source ids; nothing is
 * copied. Used by the register so it can show + facet on category.
 */
export async function accountRegister(
  accountId: string,
  opts: { limit?: number } = {},
): Promise<RegisterTxn[]> {
  const txns = await accountTransactions(accountId, opts);
  if (txns.length === 0) return [];

  const sourceSchema = txns[0].sourceSchema;
  const ids = txns.map((t) => t.sourceTxnId);

  const links = await getDb()
    .select({
      sourceTxnId: schema.transactionCategory.sourceTxnId,
      categoryId: schema.transactionCategory.categoryId,
      categoryName: schema.category.name,
    })
    .from(schema.transactionCategory)
    .innerJoin(
      schema.category,
      eq(schema.transactionCategory.categoryId, schema.category.id),
    )
    .where(
      and(
        eq(schema.transactionCategory.sourceSchema, sourceSchema),
        inArray(schema.transactionCategory.sourceTxnId, ids),
      ),
    );

  const byTxn = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const list = byTxn.get(l.sourceTxnId) ?? [];
    list.push({ id: l.categoryId, name: l.categoryName });
    byTxn.set(l.sourceTxnId, list);
  }

  return txns.map((t) => {
    const cats = byTxn.get(t.sourceTxnId);
    if (!cats || cats.length === 0) {
      return { ...t, categoryId: null, categoryName: null };
    }
    if (cats.length === 1) {
      return { ...t, categoryId: cats[0].id, categoryName: cats[0].name };
    }
    return { ...t, categoryId: SPLIT_CATEGORY, categoryName: "Split" };
  });
}
