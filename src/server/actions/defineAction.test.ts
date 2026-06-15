import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, describe, expect, it } from "vitest";

import { describeDb } from "@/test/db";
import { getDb, getSql, schema } from "@/lib/db";

import { createContext } from "../context";
import { createCallerFactory, router } from "../trpc";
import { defineAction } from "./defineAction";

const TEST_ACTION = "__test.echo";

const testRouter = router({
  echo: defineAction({
    name: TEST_ACTION,
    input: z.object({ value: z.string() }),
    handler: async ({ input }) => ({ echoed: input.value }),
    target: (input) => input.value,
  }),
  denied: defineAction({
    name: "__test.denied",
    input: z.object({ value: z.string() }),
    authorize: () => false,
    handler: async ({ input }) => input,
  }),
});

const call = createCallerFactory(testRouter)(createContext());

describe("defineAction authorization", () => {
  it("rejects with FORBIDDEN before any DB work when authorize returns false", async () => {
    await expect(call.denied({ value: "x" })).rejects.toThrow(/denied/i);
  });
});

describeDb("defineAction audit (live MyDB)", () => {
  afterAll(async () => {
    // Clean up rows this test wrote, then close the pool.
    await getDb()
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.action, TEST_ACTION));
    await getSql().end({ timeout: 5 });
  });

  it("runs the handler and writes one audit row atomically", async () => {
    const result = await call.echo({ value: "hello-lineage" });
    expect(result.echoed).toBe("hello-lineage");

    const rows = await getDb()
      .select()
      .from(schema.auditLog)
      .where(eq(schema.auditLog.action, TEST_ACTION));

    expect(rows.length).toBeGreaterThanOrEqual(1);
    const row = rows.find((r) => r.target === "hello-lineage");
    expect(row).toBeDefined();
    expect(row?.actor).toBe("bob");
    expect(row?.payload).toEqual({ value: "hello-lineage" });
  });
});
