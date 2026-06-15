import type { CanonicalTxn } from "@/lib/db/read-models";

/**
 * Client-safe register types/constants — no DB imports, so client components can
 * use them without pulling server-only code (postgres) into the bundle.
 */

/** Sentinel category for a transaction split across multiple categories. */
export const SPLIT_CATEGORY = "__split";

/** A canonical transaction enriched with its PFM categorization (for the register). */
export interface RegisterTxn extends CanonicalTxn {
  /** Category id, the {@link SPLIT_CATEGORY} sentinel, or null if uncategorized. */
  categoryId: string | null;
  /** Display name: a category, "Split", or null. */
  categoryName: string | null;
}
