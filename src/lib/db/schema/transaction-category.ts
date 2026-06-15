import { index, text, uuid } from "drizzle-orm/pg-core";

import { category } from "./category";
import { financialmanager } from "./_schema";
import { money, timestamps } from "./columns";

/**
 * TransactionCategory — the link between a SOURCE transaction and a Category.
 *
 * Lineage is the law: this references the source row by (`source_schema`,
 * `source_txn_id`) and **never copies it**. Multiple rows per source txn support
 * splits; `amount` is the portion assigned to `category_id`.
 */
export const transactionCategory = financialmanager.table(
  "transaction_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Source schema of the referenced txn, e.g. "schwab_checking". */
    sourceSchema: text("source_schema").notNull(),
    /** The source view's transaction id — referenced, never copied. */
    sourceTxnId: text("source_txn_id").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    /** Portion of the txn assigned to this category (supports splits). */
    amount: money("amount").notNull(),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("transaction_category_source_idx").on(t.sourceSchema, t.sourceTxnId),
  ],
);

export type TransactionCategory = typeof transactionCategory.$inferSelect;
export type NewTransactionCategory = typeof transactionCategory.$inferInsert;
