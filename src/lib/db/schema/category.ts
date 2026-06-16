import {
  type AnyPgColumn,
  integer,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

export const CATEGORY_KINDS = ["Income", "Expense", "Transfer"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/**
 * Category — the Income / Expense / Transfer hierarchy. Self-referencing
 * `parent_id` forms the tree (top-level kinds are roots). `name` is unique so
 * seeding is idempotent (upsert on conflict).
 */
export const category = financialmanager.table(
  "category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    parentId: uuid("parent_id").references((): AnyPgColumn => category.id),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
    /** Manual display order among siblings (lower first; NULLs sort last). */
    sortOrder: integer("sort_order"),
    ...timestamps,
  },
  (t) => [unique("category_name_unique").on(t.name)],
);

export type Category = typeof category.$inferSelect;
export type NewCategory = typeof category.$inferInsert;
