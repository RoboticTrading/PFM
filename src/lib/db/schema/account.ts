import { boolean, jsonb, text, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { institution } from "./institution";
import { timestamps } from "./columns";

export const ACCOUNT_KINDS = [
  "brokerage",
  "checking",
  "credit-card",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/**
 * How a source view's columns map to PFM's canonical transaction shape
 * (`transaction_id`, `transaction_date`, `description`, `amount`). PFM never
 * copies source rows — this mapping lets read-models project any source view
 * into the canonical shape on read.
 */
export interface ColumnMapping {
  transactionId: string;
  transactionDate: string;
  description: string;
  amount: string;
  /** Optional extras some views expose (symbol, quantity, etc.). */
  extras?: Record<string, string>;
}

/**
 * Account — the config-driven registry. Each account points at a source schema
 * + view and carries the column mapping needed to read it. The `pfm` role's
 * read-only grant on the source schemas enforces the boundary.
 */
export const account = financialmanager.table("account", {
  id: uuid("id").defaultRandom().primaryKey(),
  institutionId: uuid("institution_id")
    .notNull()
    .references(() => institution.id),
  name: text("name").notNull(),
  kind: text("kind", { enum: ACCOUNT_KINDS }).notNull(),
  /** Source schema, e.g. "schwab_brokerage". RO to PFM. */
  sourceSchema: text("source_schema").notNull(),
  /** Source view, e.g. "v_trade_transactions". */
  sourceView: text("source_view").notNull(),
  /** How the source view maps to the canonical txn shape. */
  columnMapping: jsonb("column_mapping").$type<ColumnMapping>().notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
