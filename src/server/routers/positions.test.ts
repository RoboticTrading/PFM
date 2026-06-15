import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("pairFillsIntoPosition (live MyDB)", () => {
  let positionId: string;

  afterAll(async () => {
    const db = getDb();
    if (positionId) {
      // legs cascade-delete with the position
      await db.delete(schema.position).where(eq(schema.position.id, positionId));
    }
    await db
      .delete(schema.auditLog)
      .where(eq(schema.auditLog.action, "pairFillsIntoPosition"));
    await getSql().end({ timeout: 5 });
  });

  it("pairs source fills into a position with legs (fills referenced, not copied)", async () => {
    const res = await call.positions.pair({
      symbol: "AAPL",
      instrumentClass: "equity",
      structureType: "outright",
      openedAt: "2026-04-15",
      legs: [
        {
          sourceSchema: "schwab_brokerage",
          sourceFillId: "__test_fill_1",
          side: "buy",
          quantity: "100",
          price: "189.50",
        },
        {
          sourceSchema: "schwab_brokerage",
          sourceFillId: "__test_fill_2",
          side: "sell",
          quantity: "100",
          price: "201.10",
        },
      ],
    });
    expect(res.legCount).toBe(2);
    positionId = res.positionId;

    const got = await call.positions.get({ id: positionId });
    expect(got).not.toBeNull();
    expect(got?.position.symbol).toBe("AAPL");
    expect(got?.position.instrumentClass).toBe("equity");
    expect(got?.position.status).toBe("open");
    expect(got?.legs).toHaveLength(2);
    // Lineage: legs reference source fills, never copy them.
    expect(got?.legs.map((l) => l.sourceFillId).sort()).toEqual([
      "__test_fill_1",
      "__test_fill_2",
    ]);

    // The new position appears in the PFM positions list.
    const list = await call.positions.list();
    expect(list.some((p) => p.id === positionId)).toBe(true);
  });
});
