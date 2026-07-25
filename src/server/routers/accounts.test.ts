import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { toScaled } from "@/lib/money";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

// The account we mutate + restore in the setBalance test.
const EDIT_KEY = "amex_card";
let original:
  | { balance: string; asOfDate: string; isLiability: boolean; kind: string; name: string }
  | undefined;

describeDb("accounts registry (live MyDB, cube.account)", () => {
  afterAll(async () => {
    // Restore the edited balance to its pre-test value, then drop the audit rows.
    if (original) {
      await call.accounts.setBalance({
        accountKey: EDIT_KEY,
        balance: original.balance,
        asOfDate: original.asOfDate,
        isLiability: original.isLiability,
        kind: original.kind,
        name: original.name,
      });
    }
    await getDb()
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.action, "setAccountBalance"));
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

  it("setBalance upserts financialmanager.account_balance; net worth + liquidity reflect it", async () => {
    const before = await call.accounts.byId({ id: EDIT_KEY });
    expect(before).not.toBeNull();
    original = {
      balance: before!.balance,
      asOfDate: before!.asOfDate ?? "2026-07-25",
      isLiability: before!.isLiability,
      kind: before!.kind,
      name: before!.name,
    };

    const NEW_BALANCE = "-777.00";
    const NEW_DATE = "2026-07-24";
    await call.accounts.setBalance({
      accountKey: EDIT_KEY,
      balance: NEW_BALANCE,
      asOfDate: NEW_DATE,
      isLiability: true,
      kind: "credit-card",
      name: before!.name,
    });

    // The upsert is visible through the same read the UI uses.
    const after = await call.accounts.byId({ id: EDIT_KEY });
    expect(toScaled(after!.balance)).toBe(toScaled(NEW_BALANCE));
    expect(after!.asOfDate).toBe(NEW_DATE);
    expect(after!.isLiability).toBe(true);

    // Net worth picks it up as a liability line of magnitude 777.00.
    const nw = await call.cube.netWorth();
    const line = nw.liabilities.find((l) => l.amount === "777.00");
    expect(line).toBeDefined();

    // Liquidity counts it inside revolving-card debt.
    const liq = await call.cube.liquidity();
    expect(Number(liq.cards)).toBeGreaterThanOrEqual(777);
    expect(liq.debts.some((d) => d.amount === "777.00")).toBe(true);

    // An audit row was written for the mutation.
    const audits = await getDb()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, "setAccountBalance"));
    expect(audits.length).toBeGreaterThanOrEqual(1);
    expect(audits.some((a) => a.target === EDIT_KEY)).toBe(true);
  });
});
