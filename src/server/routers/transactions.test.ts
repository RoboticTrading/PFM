import { afterAll, expect, it } from "vitest";

import { getSql } from "@/lib/db";
import { ALL_ACCOUNTS } from "@/lib/accounts/register-types";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("transactions.forAccount (live MyDB, cube.v_ledger)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("returns canonical ledger transactions for a cube account_key", async () => {
    const txns = await call.transactions.forAccount({
      accountId: "schwab_checking",
      limit: 10,
    });
    expect(Array.isArray(txns)).toBe(true);
    for (const t of txns) {
      expect(typeof t.sourceSchema).toBe("string");
      expect(t.sourceSchema.length).toBeGreaterThan(0);
      expect(typeof t.sourceTxnId).toBe("string");
      expect(typeof t.amount).toBe("string");
    }
  });

  it("streams every account unified via the ALL_ACCOUNTS sentinel", async () => {
    const txns = await call.transactions.forAccount({
      accountId: ALL_ACCOUNTS,
      limit: 50,
    });
    expect(Array.isArray(txns)).toBe(true);
    // Unified stream spans more than one source schema (cards + checking + brokerage).
    const schemas = new Set(txns.map((t) => t.sourceSchema));
    expect(schemas.size).toBeGreaterThan(1);
  });
});
