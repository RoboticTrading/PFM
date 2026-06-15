import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedAccounts } from "@/lib/db/seed";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("transactions.forAccount (live MyDB)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("returns canonical transactions for an account's source view", async () => {
    await seedAccounts(getDb());
    const [checking] = await getDb()
      .select()
      .from(schema.account)
      .where(eq(schema.account.sourceSchema, "schwab_checking"))
      .limit(1);

    const txns = await call.transactions.forAccount({
      accountId: checking.id,
      limit: 10,
    });
    expect(Array.isArray(txns)).toBe(true);
    for (const t of txns) {
      expect(t.sourceSchema).toBe("schwab_checking");
      expect(typeof t.sourceTxnId).toBe("string");
      expect(typeof t.amount).toBe("string");
    }
  });
});
