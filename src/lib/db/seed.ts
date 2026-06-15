import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { category, type CategoryKind } from "./schema/category";
import type * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

interface CategorySeed {
  name: string;
  kind: CategoryKind;
  /** Parent category name (a top-level kind root), or null for roots. */
  parent: string | null;
}

/**
 * The default Category hierarchy: three kind-roots plus common children.
 * Names are globally unique → seeding is idempotent (insert-or-ignore).
 */
export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  // roots
  { name: "Income", kind: "Income", parent: null },
  { name: "Expense", kind: "Expense", parent: null },
  { name: "Transfer", kind: "Transfer", parent: null },
  // income
  { name: "Salary", kind: "Income", parent: "Income" },
  { name: "Investment Income", kind: "Income", parent: "Income" },
  // expense
  { name: "Groceries", kind: "Expense", parent: "Expense" },
  { name: "Dining", kind: "Expense", parent: "Expense" },
  { name: "Housing", kind: "Expense", parent: "Expense" },
  { name: "Utilities", kind: "Expense", parent: "Expense" },
  { name: "Transportation", kind: "Expense", parent: "Expense" },
  { name: "Healthcare", kind: "Expense", parent: "Expense" },
  { name: "Entertainment", kind: "Expense", parent: "Expense" },
  { name: "Shopping", kind: "Expense", parent: "Expense" },
  // transfer
  { name: "Account Transfer", kind: "Transfer", parent: "Transfer" },
] as const;

/**
 * Insert any missing seed categories. Idempotent — safe to run repeatedly.
 * Returns the number of seed rows now present.
 */
export async function seedCategories(db: Db): Promise<number> {
  // Roots first so children can resolve their parent_id.
  const roots = CATEGORY_SEEDS.filter((c) => c.parent === null);
  const children = CATEGORY_SEEDS.filter((c) => c.parent !== null);

  for (const root of roots) {
    await db
      .insert(category)
      .values({ name: root.name, kind: root.kind })
      .onConflictDoNothing({ target: category.name });
  }

  const existing = await db
    .select({ id: category.id, name: category.name })
    .from(category);
  const idByName = new Map(existing.map((r) => [r.name, r.id]));

  for (const child of children) {
    const parentId = child.parent ? idByName.get(child.parent) : undefined;
    await db
      .insert(category)
      .values({ name: child.name, kind: child.kind, parentId })
      .onConflictDoNothing({ target: category.name });
  }

  const rows = await db.select({ id: category.id }).from(category);
  return rows.length;
}
