import { text, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

/** What kind of place holds money. */
export const INSTITUTION_KINDS = ["brokerage", "bank", "credit-card"] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/** Institution — a brokerage / bank / card issuer. */
export const institution = financialmanager.table("institution", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: INSTITUTION_KINDS }).notNull(),
  ...timestamps,
});

export type Institution = typeof institution.$inferSelect;
export type NewInstitution = typeof institution.$inferInsert;
