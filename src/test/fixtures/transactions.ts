import type {
  vCheckingTransactions,
  vNontradeTransactions,
  vTradeTransactions,
} from "@/lib/db/read-models/schemas";

/**
 * Minimal fixtures mirroring the real source-view shapes, for pure unit tests
 * of the canonical projections (no DB needed). Kept tiny on purpose — the
 * authoritative shape check is the live read-model test.
 */

export const bankTxnFixture: typeof vCheckingTransactions.$inferSelect = {
  transactionId: 4242n,
  transactionDate: "2026-05-01",
  postDate: "2026-05-02",
  description: "WHOLE FOODS MARKET",
  category: "Groceries",
  amount: "-82.10",
  debit: "82.10",
  credit: null,
  referenceNumber: "REF123",
  memo: null,
};

export const tradeTxnFixture: typeof vTradeTransactions.$inferSelect = {
  activityId: 99001n,
  tradeDate: "2026-04-15T14:30:00Z",
  type: "TRADE",
  symbol: "AAPL",
  instrumentDescription: "APPLE INC",
  positionEffect: "OPENING",
  amount: "100",
  price: "189.50",
  netAmount: "-18950.00",
  commission: "0",
  fees: "0.12",
  subAccount: "CASH",
  description: "Bought 100 AAPL",
};

export const nontradeTxnFixture: typeof vNontradeTransactions.$inferSelect = {
  activityId: 99002n,
  tradeDate: "2026-04-20T00:00:00Z",
  type: "DIVIDEND",
  symbol: "AAPL",
  instrumentDescription: "APPLE INC",
  amount: "24.00",
  netAmount: "24.00",
  description: "Qualified dividend",
  assetType: "EQUITY",
  subAccount: "CASH",
};
