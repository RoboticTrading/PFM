import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { account } from "./account";
import { financialmanager } from "./_schema";
import { timestamps } from "./columns";

export const IMPORT_STATUSES = ["running", "done", "failed"] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** ImportBatch — provenance of an import run (which source, when, how many). */
export const importBatch = financialmanager.table("import_batch", {
  id: uuid("id").defaultRandom().primaryKey(),
  sourceSchema: text("source_schema").notNull(),
  accountId: uuid("account_id").references(() => account.id),
  status: text("status", { enum: IMPORT_STATUSES }).notNull().default("running"),
  rowCount: integer("row_count").notNull().default(0),
  note: text("note"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...timestamps,
});

export type ImportBatch = typeof importBatch.$inferSelect;
export type NewImportBatch = typeof importBatch.$inferInsert;
