import { text, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

/** Payee — an optional normalized name for grouping / future rules. */
export const payee = financialmanager.table("payee", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** Normalized form for matching/grouping (optional). */
  normalized: text("normalized"),
  ...timestamps,
});

export type Payee = typeof payee.$inferSelect;
export type NewPayee = typeof payee.$inferInsert;
