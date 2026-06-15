import { sql } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { describeDb } from "@/test/db";

import { getDb, getSql } from "../index";
import { listBankTransactions } from "./transactions";
import { listNontradeTransactions, listTradeTransactions } from "./transactions";
import { listPositionHistory } from "./positions";
import type { CanonicalTxn } from "./transactions";

function assertCanonical(rows: CanonicalTxn[]): void {
  expect(Array.isArray(rows)).toBe(true);
  for (const r of rows) {
    expect(typeof r.sourceTxnId).toBe("string");
    expect(typeof r.amount).toBe("string");
    expect(typeof r.description).toBe("string");
  }
}

describeDb("source read-models (live MyDB, READ-ONLY)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("reads bank/card v_transactions into the canonical shape", async () => {
    assertCanonical(await listBankTransactions("schwab_checking", { limit: 5 }));
    assertCanonical(
      await listBankTransactions("amazon_chase_credit_card", { limit: 5 }),
    );
  });

  it("reads brokerage trade + non-trade activity", async () => {
    assertCanonical(await listTradeTransactions({ limit: 5 }));
    assertCanonical(await listNontradeTransactions({ limit: 5 }));
  });

  it("reads trade_analysis.position_history", async () => {
    const rows = await listPositionHistory({ limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.positionId).toBe("string");
    }
  });

  it("enforces the read-only boundary — PFM cannot write a source schema", async () => {
    // Attempt to create an object in a source schema; the pfm role must reject
    // it. (Fails before creating anything — no data risk.) Drizzle wraps the
    // driver error, so assert on the Postgres SQLSTATE in `.cause`.
    let error: unknown;
    try {
      await getDb().execute(
        sql`create table schwab_checking.__pfm_ro_probe (x int)`,
      );
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    const cause = (error as { cause?: { code?: string } }).cause;
    expect(cause?.code).toBe("42501"); // insufficient_privilege
  });
});
