import { bigint, boolean, date, integer, numeric, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

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

/**
 * One traded STRUCTURE — a strategy row (Bob's Excel HUD): legs grouped by their open order into a
 * Bull Put Spread / Bear Call Spread / Iron Condor / Short Future, with the power columns (capital,
 * max_loss, %RoC, %RoR). Built by 0-dte-optimizer/src/zerodte/cube/structures.py.
 */
export const cubeStructures = cube.table("structures", {
  structureId: bigint("structure_id", { mode: "number" }),
  source: text("source"),
  account: text("account"),
  underlying: text("underlying"),
  strategy: text("strategy"),
  category: text("category"), // tree path: Income / Trading / Options / Bull Put Spread
  openedAt: timestamp("opened_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  heldDays: integer("held_days"),
  legs: integer("legs"),
  qty: integer("qty"),
  openCash: numeric("open_cash"),
  closeCash: numeric("close_cash"),
  realizedPnl: numeric("realized_pnl"),
  width: numeric("width"),
  capital: numeric("capital"),
  maxLoss: numeric("max_loss"),
  roc: numeric("roc"), // realized_pnl / capital
  ror: numeric("ror"), // realized_pnl / max_loss
  status: text("status"), // closed | expired
  orderId: text("order_id"),
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

/** The covered-call ETF sleeve — held income positions (QYLD/RYLD/XYLD): basis + dividends. */
export const cubeHoldings = cube.table("holdings_income", {
  symbol: text("symbol"),
  shares: numeric("shares"),
  cashCostBasis: numeric("cash_cost_basis"),
  dividendsReceived: numeric("dividends_received"),
  netBasis: numeric("net_basis"),
  avgCostPerShare: numeric("avg_cost_per_share"),
  pctCapitalReturned: numeric("pct_capital_returned"),
  lastDividend: date("last_dividend"),
  nBuys: integer("n_buys"),
  nDividends: integer("n_dividends"),
  mark: numeric("mark"), // current price (cube.marks)
  markAt: timestamp("mark_at", { withTimezone: true }),
  marketValue: numeric("market_value"), // shares × mark
  unrealizedPnl: numeric("unrealized_pnl"), // market_value − cost basis
  totalReturn: numeric("total_return"), // unrealized + dividends
  totalReturnPct: numeric("total_return_pct"),
});

/** Bob's ETF spreadsheet, live — daily mark-to-market gain/loss per held ETF (the $/% curves). */
export const cubeEtfDaily = cube.table("etf_daily", {
  symbol: text("symbol"),
  d: date("d"),
  close: numeric("close"),
  shares: numeric("shares"),
  grossCost: numeric("gross_cost"),
  dividends: numeric("dividends"),
  netCost: numeric("net_cost"),
  costPerShare: numeric("cost_per_share"),
  marketValue: numeric("market_value"),
  gain: numeric("gain"),
  gainPct: numeric("gain_pct"),
});

/** Current marks — one price per held instrument (broker-fed), for MTM. */
export const cubeMarks = cube.table("marks", {
  symbol: text("symbol"),
  mark: numeric("mark"),
  asOf: timestamp("as_of", { withTimezone: true }),
  source: text("source"),
});

/** A tracked real-estate asset — the home (address + purchase basis Bob seeded). */
export const cubeProperty = cube.table("property", {
  propertyKey: text("property_key"),
  label: text("label"),
  address: text("address"),
  purchasePrice: numeric("purchase_price"),
  purchaseDate: date("purchase_date"),
  kind: text("kind"), // real_estate | vehicle | ...
  active: text("active"),
});

/** The house daily equity series — value (zEstimate/AVM) vs adjusted cost vs diff (Bob's chart). */
export const cubePropertyDaily = cube.table("property_daily", {
  propertyKey: text("property_key"),
  d: date("d"),
  value: numeric("value"),
  adjustedCost: numeric("adjusted_cost"),
  diff: numeric("diff"),
});

/** The house basis footprints — expenses inflate, rent deflates (the category→basis-effect ledger). */
export const cubePropertyLedger = cube.table("property_ledger", {
  ledgerId: bigint("ledger_id", { mode: "number" }),
  propertyKey: text("property_key"),
  d: date("d"),
  category: text("category"),
  amount: numeric("amount"),
  description: text("description"),
  effect: text("effect"),
});

/** Live open futures/equity positions (net-inventory, expiry-filtered), marked to market. */
export const cubeOpenPositions = cube.table("open_positions", {
  symbol: text("symbol"),
  kind: text("kind"), // future | equity
  underlying: text("underlying"),
  qty: numeric("qty"),
  direction: text("direction"),
  avgCost: numeric("avg_cost"),
  costBasis: numeric("cost_basis"),
  mark: numeric("mark"),
  markAt: timestamp("mark_at", { withTimezone: true }),
  pointValue: numeric("point_value"),
  marketValue: numeric("market_value"),
  unrealizedPnl: numeric("unrealized_pnl"),
});

/**
 * Point-in-time account balances Bob seeds (checking, brokerage margin, credit cards) — the
 * cash-side facts the trade engine can't reconstruct. Positive = asset, negative = owed; the
 * `is_liability` flag makes the sign explicit for the net-worth roll-up.
 */
export const cubeAccountSnapshot = cube.table("account_snapshot", {
  accountKey: text("account_key"), // FK to cube.account.account_key — the stable join key
  account: text("account"),
  kind: text("kind"), // checking | brokerage | credit-card
  balance: numeric("balance"),
  asOf: date("as_of"),
  isLiability: boolean("is_liability"),
});

/** Broker money movement — deposits, interest, fees, dividends (the money in/out at the broker). */
export const cubeCashFlows = cube.table("cash_flows", {
  flowId: bigint("flow_id", { mode: "number" }),
  source: text("source"),
  account: text("account"),
  flowDate: date("flow_date"),
  category: text("category"),
  rollup: text("rollup"), // income | expense | transfer | settlement (the category-tree bucket)
  amount: numeric("amount"),
  description: text("description"),
});

/**
 * The unified ledger — one row per transaction across EVERY account (checking, the 4 cards,
 * brokerage trades + non-trade activity). This is the single source of truth PFM reads
 * transactions from; it supersedes the scattered per-source `v_transactions` /
 * `v_trade_transactions` / `v_nontrade_transactions` views. `amount` is signed (+in / −out).
 * Lineage key is (`source_schema`, `source_txn_id`) — stable, referenced, never copied.
 */
export const cubeVLedger = cube.table("v_ledger", {
  accountKey: text("account_key"),
  accountName: text("account_name"),
  kind: text("kind"), // checking | credit-card | brokerage
  sourceSchema: text("source_schema"),
  sourceTxnId: text("source_txn_id"),
  txnDate: date("txn_date"),
  description: text("description"),
  amount: numeric("amount"),
  symbol: text("symbol"),
});

/** The unified account registry — one row per real account (checking, 4 cards, brokerage). */
export const cubeAccount = cube.table("account", {
  accountKey: text("account_key"),
  name: text("name"),
  kind: text("kind"), // checking | credit-card | brokerage
  active: boolean("active"),
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
