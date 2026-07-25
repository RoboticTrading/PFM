import { bigint, integer, numeric, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/**
 * READ-ONLY read-models over the `cube` schema — the unified financial warehouse.
 *
 * `cube.*` is built by the match-all trade engine (0-dte-optimizer/src/zerodte/cube, run as a
 * batch) and is READ-ONLY to the `pfm` role (DB-enforced). PFM reads facts; it never writes them.
 * Declared as Drizzle tables so they're typed + schema-qualified regardless of search_path;
 * they never appear in migrations (drizzle only owns `financialmanager`).
 */

export const cube = pgSchema("cube");

/** One matched round-trip: an open→close of one contract across days, any instrument, any broker. */
export const cubeTrades = cube.table("trades", {
  tradeId: bigint("trade_id", { mode: "number" }),
  source: text("source"),
  account: text("account"),
  symbol: text("symbol"),
  instrumentType: text("instrument_type"),
  underlying: text("underlying"),
  direction: text("direction"), // LONG | SHORT
  qty: integer("qty"),
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  heldDays: integer("held_days"),
  openCash: numeric("open_cash"),
  closeCash: numeric("close_cash"),
  realizedPnl: numeric("realized_pnl"),
  matchedVia: text("matched_via"), // trade | expiry | assignment
  builtAt: timestamp("built_at", { withTimezone: true }),
});

/** Scorecard per batch run — the match-health / trust signal. */
export const cubeMatchRuns = cube.table("match_runs", {
  runId: bigint("run_id", { mode: "number" }),
  runAt: timestamp("run_at", { withTimezone: true }),
  source: text("source"),
  fills: integer("fills"),
  roundTrips: integer("round_trips"),
  leftovers: integer("leftovers"),
  realizedPnl: numeric("realized_pnl"),
});

/** The dimensions the Cube slices by — the graph's join keys. */
export const CUBE_DIMENSIONS = [
  "underlying",
  "instrumentType",
  "direction",
  "source",
  "account",
] as const;
export type CubeDimension = (typeof CUBE_DIMENSIONS)[number];
