import { and, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";

import { accountTransactions } from "./transactions";
import { SPLIT_CATEGORY, type RegisterTxn } from "./register-types";

export { SPLIT_CATEGORY, ALL_ACCOUNTS, type RegisterTxn } from "./register-types";

/**
 * An account's canonical ledger transactions joined with their categorization.
 * Lineage intact — categorizations are matched by the composite key
 * (`source_schema`, `source_txn_id`), never copied. One account can span several
 * source schemas (brokerage = trade + non-trade; the unified view = all of them),
 * so the join keys on the pair, not the id alone.
 */
export async function accountRegister(
  accountKey: string,
  opts: { limit?: number } = {},
): Promise<RegisterTxn[]> {
  const txns = await accountTransactions(accountKey, opts);
  if (txns.length === 0) return [];

  const schemas = [...new Set(txns.map((t) => t.sourceSchema))];
  const ids = [...new Set(txns.map((t) => t.sourceTxnId))];

  const links = await getDb()
    .select({
      sourceSchema: schema.transactionCategory.sourceSchema,
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
        inArray(schema.transactionCategory.sourceSchema, schemas),
        inArray(schema.transactionCategory.sourceTxnId, ids),
      ),
    );

  const keyOf = (sourceSchema: string, sourceTxnId: string) =>
    `${sourceSchema}:${sourceTxnId}`;

  const byTxn = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const k = keyOf(l.sourceSchema, l.sourceTxnId);
    const list = byTxn.get(k) ?? [];
    list.push({ id: l.categoryId, name: l.categoryName });
    byTxn.set(k, list);
  }

  return txns.map((t) => {
    const cats = byTxn.get(keyOf(t.sourceSchema, t.sourceTxnId));
    if (!cats || cats.length === 0) {
      return { ...t, categoryId: null, categoryName: null };
    }
    if (cats.length === 1) {
      return { ...t, categoryId: cats[0].id, categoryName: cats[0].name };
    }
    return { ...t, categoryId: SPLIT_CATEGORY, categoryName: "Split" };
  });
}
