import { afterAll, expect, it } from "vitest";

import { getSql } from "@/lib/db";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("accounts registry (live MyDB, cube.account)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("accounts.list returns every cube account, institution-enriched with a balance", async () => {
    const list = await call.accounts.list();
    // checking + 4 cards + brokerage
    expect(list.length).toBeGreaterThanOrEqual(6);

    const checking = list.find((a) => a.id === "schwab_checking");
    expect(checking).toBeDefined();
    expect(checking?.kind).toBe("checking");
    expect(checking?.institutionName).toBe("Charles Schwab — Bank");
    expect(checking?.institutionKind).toBe("bank");
    // A snapshot-sourced current balance is present as a fixed-precision string.
    expect(typeof checking?.balance).toBe("string");
  });

  it("accounts.byId resolves a cube account_key", async () => {
    const acct = await call.accounts.byId({ id: "bofa_card" });
    expect(acct).not.toBeNull();
    expect(acct?.kind).toBe("credit-card");
    expect(acct?.institutionName).toBe("Bank of America");
  });
});
