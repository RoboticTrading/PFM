import { date, index, text, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { money, timestamps } from "./columns";

export const POSITION_STATUSES = ["open", "closed"] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const POSITION_LEG_SIDES = ["buy", "sell"] as const;
export type PositionLegSide = (typeof POSITION_LEG_SIDES)[number];

/**
 * Position — a manual position, paired from fills. Carries the instrument class
 * + trade-structure taxonomy (type/subtype) ported from the MVP's
 * `manual_positions`. The MVP's position pairing is a first-class PFM feature.
 */
export const position = financialmanager.table("position", {
  id: uuid("id").defaultRandom().primaryKey(),
  symbol: text("symbol").notNull(),
  /** equity / option / future / … */
  instrumentClass: text("instrument_class").notNull(),
  /** Trade structure type (e.g. "vertical", "outright"). */
  structureType: text("structure_type"),
  /** Optional structure subtype. */
  structureSubtype: text("structure_subtype"),
  status: text("status", { enum: POSITION_STATUSES }).notNull().default("open"),
  openedAt: date("opened_at"),
  closedAt: date("closed_at"),
  notes: text("notes"),
  ...timestamps,
});

/**
 * PositionLeg — a fill paired into a position. References the source fill by
 * (`source_schema`, `source_fill_id`); never copies the source fill row.
 */
export const positionLeg = financialmanager.table(
  "position_leg",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    /** Source schema of the paired fill, e.g. "schwab_brokerage". */
    sourceSchema: text("source_schema").notNull(),
    /** The source fill id — referenced, never copied. */
    sourceFillId: text("source_fill_id").notNull(),
    side: text("side", { enum: POSITION_LEG_SIDES }).notNull(),
    quantity: money("quantity").notNull(),
    price: money("price").notNull(),
    ...timestamps,
  },
  (t) => [index("position_leg_position_idx").on(t.positionId)],
);

/**
 * PositionLink — links a PFM Position to a `trade_analysis.position_history`
 * row (read-only source). Stores the source PK reference, never copies it.
 */
export const positionLink = financialmanager.table(
  "position_link",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    positionId: uuid("position_id")
      .notNull()
      .references(() => position.id, { onDelete: "cascade" }),
    /** PK (uuid) in trade_analysis.position_history. */
    positionHistoryId: uuid("position_history_id").notNull(),
    ...timestamps,
  },
  (t) => [index("position_link_position_idx").on(t.positionId)],
);

export type Position = typeof position.$inferSelect;
export type NewPosition = typeof position.$inferInsert;
export type PositionLeg = typeof positionLeg.$inferSelect;
export type NewPositionLeg = typeof positionLeg.$inferInsert;
export type PositionLink = typeof positionLink.$inferSelect;
export type NewPositionLink = typeof positionLink.$inferInsert;
