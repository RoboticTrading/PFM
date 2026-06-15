import { desc } from "drizzle-orm";

import { getDb } from "../index";
import {
  BANK_SOURCES,
  type BankSourceSchema,
  vNontradeTransactions,
  vTradeTransactions,
} from "./schemas";

/**
 * The canonical transaction shape every source projects into. Categorization
 * and lineage reference (`sourceSchema`, `sourceTxnId`); the row is never copied
 * into `financialmanager`.
 */
export interface CanonicalTxn {
  sourceSchema: string;
  sourceView: string;
  sourceTxnId: string;
  /** ISO date (or timestamp) string. */
  date: string;
  description: string;
  /** Signed amount as a fixed-precision string. */
  amount: string;
  symbol?: string;
}

interface ListOpts {
  limit?: number;
}

const DEFAULT_LIMIT = 100;

/** Bank/card transactions for a source schema, newest first (canonical shape). */
export async function listBankTransactions(
  source: BankSourceSchema,
  opts: ListOpts = {},
): Promise<CanonicalTxn[]> {
  const view = BANK_SOURCES[source];
  const rows = await getDb()
    .select()
    .from(view)
    .orderBy(desc(view.transactionDate))
    .limit(opts.limit ?? DEFAULT_LIMIT);

  return rows.map((r) => ({
    sourceSchema: source,
    sourceView: "v_transactions",
    sourceTxnId: String(r.transactionId),
    date: r.transactionDate ?? "",
    description: r.description ?? "",
    amount: r.amount ?? "0",
  }));
}

/** Schwab brokerage trade fills, newest first (canonical shape). */
export async function listTradeTransactions(
  opts: ListOpts = {},
): Promise<CanonicalTxn[]> {
  const rows = await getDb()
    .select()
    .from(vTradeTransactions)
    .orderBy(desc(vTradeTransactions.tradeDate))
    .limit(opts.limit ?? DEFAULT_LIMIT);

  return rows.map((r) => ({
    sourceSchema: "schwab_brokerage",
    sourceView: "v_trade_transactions",
    sourceTxnId: String(r.activityId),
    date: r.tradeDate ?? "",
    description: r.description ?? r.instrumentDescription ?? "",
    amount: r.netAmount ?? r.amount ?? "0",
    symbol: r.symbol ?? undefined,
  }));
}

/** Schwab brokerage non-trade activity (dividends, fees…), newest first. */
export async function listNontradeTransactions(
  opts: ListOpts = {},
): Promise<CanonicalTxn[]> {
  const rows = await getDb()
    .select()
    .from(vNontradeTransactions)
    .orderBy(desc(vNontradeTransactions.tradeDate))
    .limit(opts.limit ?? DEFAULT_LIMIT);

  return rows.map((r) => ({
    sourceSchema: "schwab_brokerage",
    sourceView: "v_nontrade_transactions",
    sourceTxnId: String(r.activityId),
    date: r.tradeDate ?? "",
    description: r.description ?? "",
    amount: r.netAmount ?? r.amount ?? "0",
    symbol: r.symbol ?? undefined,
  }));
}
