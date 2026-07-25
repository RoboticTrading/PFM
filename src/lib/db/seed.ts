import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ACCOUNTS, INSTITUTIONS } from "@/lib/accounts/registry";

import { account } from "./schema/account";
import { accountBalance } from "./schema/account-balance";
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
 * The default Category hierarchy: ONLY the three kind-roots. Sub-categories are
 * the owner's to build — we never seed them. Names are globally unique → seeding
 * is idempotent (insert-or-ignore), so this is safe to run on every boot.
 */
export const CATEGORY_SEEDS: readonly CategorySeed[] = [
  { name: "Income", kind: "Income", parent: null },
  { name: "Expense", kind: "Expense", parent: null },
  { name: "Transfer", kind: "Transfer", parent: null },
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

interface AccountBalanceSeed {
  accountKey: string;
  name: string;
  kind: string;
  balance: string;
  asOfDate: string;
  isLiability: boolean;
}

/**
 * The owner-editable current balances — the writable replacement for the balances
 * that used to be read-only in `cube.account_snapshot`. Seeded from that snapshot's
 * point-in-time state so a fresh DB self-provisions; thereafter the owner edits them
 * through the UI. Keyed by `account_key` (the stable cube join key).
 */
export const ACCOUNT_BALANCE_SEEDS: readonly AccountBalanceSeed[] = [
  { accountKey: "schwab_checking", name: "Schwab Checking", kind: "checking", balance: "1784.54", asOfDate: "2026-07-25", isLiability: false },
  { accountKey: "schwab_brokerage", name: "Schwab Brokerage (cash/margin)", kind: "brokerage", balance: "-25963.22", asOfDate: "2026-07-25", isLiability: true },
  { accountKey: "bofa_card", name: "Bank of America Card", kind: "credit-card", balance: "-22949.56", asOfDate: "2026-07-25", isLiability: true },
  { accountKey: "amazon_chase_card", name: "Amazon (Chase) Card", kind: "credit-card", balance: "-6248.42", asOfDate: "2026-07-25", isLiability: true },
  { accountKey: "amex_card", name: "American Express Card", kind: "credit-card", balance: "-262.57", asOfDate: "2026-07-25", isLiability: true },
  { accountKey: "costco_citi_card", name: "Costco (Citi) Card", kind: "credit-card", balance: "-49.51", asOfDate: "2026-07-25", isLiability: true },
] as const;

/**
 * Seed the owner-editable account balances. Idempotent: inserts any missing
 * `account_key` and NEVER clobbers an existing row (`onConflictDoNothing`), so a
 * re-seed can't overwrite a balance the owner has since edited. Returns the count
 * of balances now present.
 */
export async function seedAccountBalances(db: Db): Promise<number> {
  for (const s of ACCOUNT_BALANCE_SEEDS) {
    await db
      .insert(accountBalance)
      .values({
        accountKey: s.accountKey,
        name: s.name,
        kind: s.kind,
        balance: s.balance,
        asOfDate: s.asOfDate,
        isLiability: s.isLiability,
      })
      .onConflictDoNothing({ target: accountBalance.accountKey });
  }

  const rows = await db.select({ id: accountBalance.id }).from(accountBalance);
  return rows.length;
}
