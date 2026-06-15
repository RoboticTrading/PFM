import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";

/**
 * AuditLog — every governed Action (see `defineAction`, task 1.5) writes one row
 * here. Established now as the foundational cross-cutting table so the Action
 * wrapper has somewhere to record to. `payload` is the redacted Action input.
 */
export const auditLog = financialmanager.table("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Who performed the action (single-user PFM → typically "bob"). */
  actor: text("actor").notNull(),
  /** Action name, e.g. "categorize", "setBalanceForward". */
  action: text("action").notNull(),
  /** Optional target reference (e.g. a source_txn_id or account id). */
  target: text("target"),
  /** Redacted action input/result, for lineage and debugging. */
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
