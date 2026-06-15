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
// Far-future anchor → no source transactions after it, so `since` is exactly 0
// and the balance equals the forward amount (deterministic, data-independent).
const ANCHOR = "2999-12-31";

describeDb("balance-forward + accountBalance (live MyDB)", () => {
  let accountId: string;

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

  it("setForward then accountBalance = forward + Σ since (since=0 at anchor)", async () => {
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

    const res = await call.balances.forAccount({ accountId });
    expect(res.asOfDate).toBe(ANCHOR);
    expect(res.forward).toBe("1234.5600");
    expect(toScaled(res.since)).toBe(0n);
    expect(res.balance).toBe("1234.5600");
  });

  it("setForward upserts (same account+date updates the amount)", async () => {
    await call.balances.setForward({
      accountId,
      asOfDate: ANCHOR,
      amount: "2000.0000",
    });
    const res = await call.balances.forAccount({ accountId });
    expect(res.forward).toBe("2000.0000");
    expect(res.balance).toBe("2000.0000");
  });
});
