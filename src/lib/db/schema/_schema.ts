import { pgSchema } from "drizzle-orm/pg-core";

/**
 * The `financialmanager` schema — the ONLY schema PFM owns (RW). Every PFM table
 * lives here. The source schemas (`schwab_*`, `*_credit_card`, `trade_analysis`)
 * are read-only and are never defined with Drizzle; they're accessed via typed
 * read-models. The `pfm` DB role enforces this boundary regardless.
 */
export const financialmanager = pgSchema("financialmanager");
