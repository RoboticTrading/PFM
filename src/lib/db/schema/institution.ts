import { text, unique, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

/** What kind of place holds money. */
export const INSTITUTION_KINDS = ["brokerage", "bank", "credit-card"] as const;
export type InstitutionKind = (typeof INSTITUTION_KINDS)[number];

/** Institution — a brokerage / bank / card issuer. `name` is the natural key. */
export const institution = financialmanager.table(
  "institution",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    kind: text("kind", { enum: INSTITUTION_KINDS }).notNull(),
    ...timestamps,
  },
  (t) => [unique("institution_name_unique").on(t.name)],
);

export type Institution = typeof institution.$inferSelect;
export type NewInstitution = typeof institution.$inferInsert;
