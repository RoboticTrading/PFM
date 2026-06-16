import {
  bigint,
  boolean,
  date,
  numeric,
  pgSchema,
  text,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * READ-ONLY read-models over the source schemas PFM does not own.
 *
 * These are declared with Drizzle `.existing()` views so they're typed and
 * queryable but NEVER appear in migrations (drizzle.config's schemaFilter is
 * `financialmanager` only). The `pfm` DB role is RO on every schema here —
 * the database rejects any write regardless. PFM reads; it never mutates.
 *
 * USER-DEFINED enum columns are typed as `text` (the driver returns enum values
 * as strings).
 */

// --- Source schemas -------------------------------------------------------
export const schwabBrokerage = pgSchema("schwab_brokerage");
export const schwabChecking = pgSchema("schwab_checking");
export const amazonChaseCard = pgSchema("amazon_chase_credit_card");
export const amexCard = pgSchema("american_express_credit_card");
export const bofaCard = pgSchema("bank_of_america_credit_card");
export const costcoCitiCard = pgSchema("costco_citi_credit_card");
export const tradeAnalysis = pgSchema("trade_analysis");

// --- Bank/card transactions (identical v_transactions across checking + 4 cards)
function bankTransactionsView(schema: ReturnType<typeof pgSchema>) {
  return schema
    .view("v_transactions", {
      transactionId: bigint("transaction_id", { mode: "bigint" }),
      transactionDate: date("transaction_date"),
      postDate: date("post_date"),
      description: text("description"),
      category: varchar("category"),
      amount: numeric("amount"),
      debit: numeric("debit"),
      credit: numeric("credit"),
      referenceNumber: varchar("reference_number"),
      memo: text("memo"),
    })
    .existing();
}

export const vCheckingTransactions = bankTransactionsView(schwabChecking);
export const vAmazonChaseTransactions = bankTransactionsView(amazonChaseCard);
export const vAmexTransactions = bankTransactionsView(amexCard);
export const vBofaTransactions = bankTransactionsView(bofaCard);
export const vCostcoCitiTransactions = bankTransactionsView(costcoCitiCard);

/** Bank/card source schemas that expose the canonical `v_transactions` shape. */
export const BANK_SOURCES = {
  schwab_checking: vCheckingTransactions,
  amazon_chase_credit_card: vAmazonChaseTransactions,
  american_express_credit_card: vAmexTransactions,
  bank_of_america_credit_card: vBofaTransactions,
  costco_citi_credit_card: vCostcoCitiTransactions,
} as const;

export type BankSourceSchema = keyof typeof BANK_SOURCES;

// --- Schwab brokerage trade / non-trade ----------------------------------
export const vTradeTransactions = schwabBrokerage
  .view("v_trade_transactions", {
    activityId: bigint("activity_id", { mode: "bigint" }),
    tradeDate: text("trade_date"),
    type: text("type"),
    symbol: varchar("symbol"),
    instrumentDescription: text("instrument_description"),
    positionEffect: text("position_effect"),
    amount: numeric("amount"),
    price: numeric("price"),
    netAmount: numeric("net_amount"),
    commission: numeric("commission"),
    fees: numeric("fees"),
    subAccount: text("sub_account"),
    description: text("description"),
  })
  .existing();

export const vNontradeTransactions = schwabBrokerage
  .view("v_nontrade_transactions", {
    activityId: bigint("activity_id", { mode: "bigint" }),
    tradeDate: text("trade_date"),
    type: text("type"),
    symbol: varchar("symbol"),
    instrumentDescription: text("instrument_description"),
    amount: numeric("amount"),
    netAmount: numeric("net_amount"),
    description: text("description"),
    assetType: text("asset_type"),
    subAccount: text("sub_account"),
  })
  .existing();

// --- trade_analysis.position_history (a base table; for position linking) -
export const positionHistory = tradeAnalysis.table("position_history", {
  positionId: uuid("position_id"),
  strategyType: text("strategy_type"),
  underlying: text("underlying"),
  expiration: date("expiration"),
  openDate: date("open_date"),
  openOrderId: bigint("open_order_id", { mode: "bigint" }),
  openPremium: numeric("open_premium"),
  openCost: numeric("open_cost"),
  closeDate: date("close_date"),
  closeOrderId: bigint("close_order_id", { mode: "bigint" }),
  closePremium: numeric("close_premium"),
  isClosed: boolean("is_closed"),
  netPnl: numeric("net_pnl"),
  contracts: bigint("contracts", { mode: "number" }),
  notes: text("notes"),
});
