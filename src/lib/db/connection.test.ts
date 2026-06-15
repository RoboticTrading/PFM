import { afterAll, describe, expect, it } from "vitest";

import { dbHealth, getSql, hasDatabaseUrl } from "./index";

// Runs against live MyDB locally; skips cleanly in CI (no DATABASE_URL).
const describeDb = hasDatabaseUrl() ? describe : describe.skip;

describeDb("MyDB connectivity (pfm role)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("connects as pfm and sees the financialmanager schema", async () => {
    const health = await dbHealth();
    expect(health.user).toBe("pfm");
    expect(health.financialmanagerPresent).toBe(true);
  });
});

describe("hasDatabaseUrl", () => {
  it("reflects whether DATABASE_URL is configured", () => {
    expect(hasDatabaseUrl()).toBe(Boolean(process.env.DATABASE_URL));
  });
});
