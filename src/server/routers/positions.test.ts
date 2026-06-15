import { eq, inArray } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";

import { getDb, getSql, schema } from "@/lib/db";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

async function pairTestPosition(symbol: string): Promise<string> {
  const res = await call.positions.pair({
    symbol,
    instrumentClass: "equity",
    structureType: "outright",
    openedAt: "2026-04-15",
    legs: [
      {
        sourceSchema: "schwab_brokerage",
        sourceFillId: `__test_fill_${symbol}_1`,
        side: "buy",
        quantity: "100",
        price: "189.50",
      },
      {
        sourceSchema: "schwab_brokerage",
        sourceFillId: `__test_fill_${symbol}_2`,
        side: "sell",
        quantity: "100",
        price: "201.10",
      },
    ],
  });
  return res.positionId;
}

describeDb("positions: pair / link / views (live MyDB)", () => {
  const created: string[] = [];

  afterAll(async () => {
    const db = getDb();
    if (created.length) {
      // legs + links cascade-delete with the position
      await db.delete(schema.position).where(inArray(schema.position.id, created));
    }
    await db
      .delete(schema.auditLog)
      .where(
        inArray(schema.auditLog.action, [
          "pairFillsIntoPosition",
          "linkPosition",
        ]),
      );
    await getSql().end({ timeout: 5 });
  });

  it("pairs fills into a position with legs (referenced, not copied)", async () => {
    const id = await pairTestPosition("AAPL");
    created.push(id);

    const got = await call.positions.get({ id });
    expect(got?.position.symbol).toBe("AAPL");
    expect(got?.legs).toHaveLength(2);
    expect(got?.legs.map((l) => l.sourceFillId).sort()).toEqual([
      "__test_fill_AAPL_1",
      "__test_fill_AAPL_2",
    ]);
  });

  it("appears in open and unmatched until linked, then drops from unmatched", async () => {
    const id = await pairTestPosition("MSFT");
    created.push(id);

    expect((await call.positions.open()).some((p) => p.id === id)).toBe(true);
    expect((await call.positions.unmatched()).some((p) => p.id === id)).toBe(
      true,
    );

    // Link to a real position_history row if one exists; otherwise prove the
    // existence check rejects a bogus id (and the position stays unmatched).
    const history = await call.positions.history({ openOnly: false, limit: 1 });
    if (history.length > 0) {
      await call.positions.linkPosition({
        positionId: id,
        positionHistoryId: history[0].positionId,
      });
      expect(
        (await call.positions.unmatched()).some((p) => p.id === id),
      ).toBe(false);
    } else {
      await expect(
        call.positions.linkPosition({
          positionId: id,
          positionHistoryId: "00000000-0000-0000-0000-000000000000",
        }),
      ).rejects.toThrow(/not found/i);
      expect(
        (await call.positions.unmatched()).some((p) => p.id === id),
      ).toBe(true);
    }
  });

  it("history view reads trade_analysis.position_history (read-only)", async () => {
    const rows = await call.positions.history({ openOnly: false, limit: 5 });
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(typeof r.positionId).toBe("string");
  });
});
