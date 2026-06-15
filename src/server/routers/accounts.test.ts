import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { seedAccounts } from "@/lib/db/seed";
import { ACCOUNTS } from "@/lib/accounts/registry";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("accounts registry (live MyDB)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("syncs the registry idempotently", async () => {
    // Seed twice; assert each registry account exists exactly once. (Counting
    // by natural key is robust to unrelated test accounts created concurrently
    // by other suites against the same MyDB.)
    await seedAccounts(getDb());
    await seedAccounts(getDb());
    const rows = await getDb()
      .select({
        sourceSchema: schema.account.sourceSchema,
        sourceView: schema.account.sourceView,
      })
      .from(schema.account);
    for (const spec of ACCOUNTS) {
      const matches = rows.filter(
        (r) =>
          r.sourceSchema === spec.sourceSchema &&
          r.sourceView === spec.sourceView,
      );
      expect(matches, `${spec.sourceSchema}.${spec.sourceView}`).toHaveLength(1);
    }
  });

  it("accounts.list returns registry accounts joined with their institution", async () => {
    await seedAccounts(getDb());
    const list = await call.accounts.list();
    expect(list.length).toBeGreaterThanOrEqual(ACCOUNTS.length);

    const checking = list.find((a) => a.sourceSchema === "schwab_checking");
    expect(checking).toBeDefined();
    expect(checking?.institutionName).toBe("Charles Schwab — Bank");
    expect(checking?.institutionKind).toBe("bank");
  });
});
