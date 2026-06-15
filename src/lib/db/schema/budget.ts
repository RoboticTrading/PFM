import { text, unique, uuid } from "drizzle-orm/pg-core";

import { category } from "./category";
import { financialmanager } from "./_schema";
import { money, timestamps } from "./columns";

/**
 * Budget — a target `amount` for a Category in a `period`. `period` is a label
 * like "2026-06" (month) or "2026" (year); one budget per category per period.
 */
export const budget = financialmanager.table(
  "budget",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    period: text("period").notNull(),
    amount: money("amount").notNull(),
    ...timestamps,
  },
  (t) => [unique("budget_category_period").on(t.categoryId, t.period)],
);

export type Budget = typeof budget.$inferSelect;
export type NewBudget = typeof budget.$inferInsert;
