import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ACCOUNTS, INSTITUTIONS } from "@/lib/accounts/registry";

import { account } from "./schema/account";
import { category, type CategoryKind } from "./schema/category";
import { institution } from "./schema/institution";
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

/**
 * Sync the account registry (institutions + accounts) into MyDB. Idempotent —
 * upserts by natural key (institution.name, account.source_schema+view).
 * Returns the number of accounts now present.
 */
export async function seedAccounts(db: Db): Promise<number> {
  for (const inst of INSTITUTIONS) {
    await db
      .insert(institution)
      .values({ name: inst.name, kind: inst.kind })
      .onConflictDoNothing({ target: institution.name });
  }

  const institutions = await db
    .select({ id: institution.id, name: institution.name })
    .from(institution);
  const idByName = new Map(institutions.map((i) => [i.name, i.id]));

  for (const spec of ACCOUNTS) {
    const institutionId = idByName.get(spec.institution);
    if (!institutionId) {
      throw new Error(
        `Account "${spec.name}" references unknown institution "${spec.institution}".`,
      );
    }
    await db
      .insert(account)
      .values({
        institutionId,
        name: spec.name,
        kind: spec.kind,
        sourceSchema: spec.sourceSchema,
        sourceView: spec.sourceView,
        columnMapping: spec.columnMapping,
      })
      .onConflictDoNothing({
        target: [account.sourceSchema, account.sourceView],
      });
  }

  const rows = await db.select({ id: account.id }).from(account);
  return rows.length;
}
