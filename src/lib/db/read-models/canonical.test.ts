import { describe, expect, it } from "vitest";

import {
  bankTxnFixture,
  ledgerTxnFixture,
  nontradeTxnFixture,
  tradeTxnFixture,
} from "@/test/fixtures/transactions";

import { toCanonicalLedger } from "./ledger";
import {
  toCanonicalBankTxn,
  toCanonicalNontrade,
  toCanonicalTrade,
} from "./transactions";

// Pure projection tests — no DB. These run everywhere, including CI.
describe("canonical transaction projections", () => {
  it("projects a bank/card row, stringifying the bigint id", () => {
    const c = toCanonicalBankTxn("schwab_checking", bankTxnFixture);
    expect(c).toMatchObject({
      sourceSchema: "schwab_checking",
      sourceView: "v_transactions",
      sourceTxnId: "4242",
      amount: "-82.10",
      description: "WHOLE FOODS MARKET",
    });
  });

  it("projects a trade fill, preferring net_amount and carrying the symbol", () => {
    const c = toCanonicalTrade(tradeTxnFixture);
    expect(c.sourceView).toBe("v_trade_transactions");
    expect(c.sourceTxnId).toBe("99001");
    expect(c.amount).toBe("-18950.00");
    expect(c.symbol).toBe("AAPL");
  });

  it("projects a non-trade row (dividend)", () => {
    const c = toCanonicalNontrade(nontradeTxnFixture);
    expect(c.sourceView).toBe("v_nontrade_transactions");
    expect(c.amount).toBe("24.00");
    expect(c.description).toBe("Qualified dividend");
  });

  it("projects a unified ledger row, passing source_schema/source_txn_id through as the lineage key", () => {
    const c = toCanonicalLedger(ledgerTxnFixture);
    expect(c).toMatchObject({
      sourceSchema: "bank_of_america_credit_card",
      sourceView: "v_ledger",
      sourceTxnId: "778812",
      date: "2026-07-01",
      description: "COSTCO WHOLESALE",
      amount: "-241.87",
    });
    expect(c.symbol).toBeUndefined();
  });
});
