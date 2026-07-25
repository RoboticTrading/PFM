import { and, eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedAccounts } from "@/lib/db/seed";
import { toScaled } from "@/lib/money";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());
const ANCHOR = "2999-12-31";

describeDb("balances (live MyDB, financialmanager.account_balance)", () => {
  let accountId: string | undefined;

  afterAll(async () => {
    const db = getDb();
    if (accountId) {
      await db
        .delete(schema.balanceForward)
        .where(
          and(
            eq(schema.balanceForward.accountId, accountId),
            eq(schema.balanceForward.asOfDate, ANCHOR),
          ),
        );
    }
    await db
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.action, "setBalanceForward"));
    await getSql().end({ timeout: 5 });
  });

  it("forAccount returns the current balance from financialmanager.account_balance", async () => {
    const res = await call.balances.forAccount({ accountId: "schwab_checking" });
    expect(typeof res.balance).toBe("string");
    // The whole balance is the stored balance (forward), with `since` = 0.
    expect(res.forward).toBe(res.balance);
    expect(toScaled(res.since)).toBe(0n);

    const [bal] = await getDb()
      .select()
      .from(schema.accountBalance)
      .where(eq(schema.accountBalance.accountKey, "schwab_checking"))
      .limit(1);
    if (bal) {
      expect(toScaled(res.balance)).toBe(toScaled(bal.balance ?? "0"));
      expect(res.asOfDate).toBe(bal.asOfDate);
    }
  });

  it("setForward still upserts an app-owned balance_forward row (unchanged)", async () => {
    // The app-owned write path (financialmanager.balance_forward) is preserved.
    await seedAccounts(getDb());
    const [checking] = await getDb()
      .select()
      .from(schema.account)
      .where(eq(schema.account.sourceSchema, "schwab_checking"))
      .limit(1);
    accountId = checking.id;

    await call.balances.setForward({
      accountId,
      asOfDate: ANCHOR,
      amount: "1234.5600",
    });

    const [row] = await getDb()
      .select()
      .from(schema.balanceForward)
      .where(
        and(
          eq(schema.balanceForward.accountId, accountId),
          eq(schema.balanceForward.asOfDate, ANCHOR),
        ),
      )
      .limit(1);
    expect(row?.amount).toBe("1234.5600");
  });
});
