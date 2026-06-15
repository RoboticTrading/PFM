import { afterAll, expect, it } from "vitest";

import { getDb, getSql } from "@/lib/db";
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
    const first = await seedAccounts(getDb());
    const second = await seedAccounts(getDb());
    expect(second).toBe(first);
    expect(second).toBeGreaterThanOrEqual(ACCOUNTS.length);
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
