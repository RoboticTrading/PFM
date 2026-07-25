import { afterAll, expect, it } from "vitest";

import { getSql } from "@/lib/db";
import { addMoney, subMoney, sumMoney } from "@/lib/money";
import { describeDb } from "@/test/db";

import { createContext } from "../context";
import { createCallerFactory } from "../trpc";
import { appRouter } from "./_app";

const call = createCallerFactory(appRouter)(createContext());

describeDb("cube.liquidity (live MyDB)", () => {
  afterAll(async () => {
    await getSql().end({ timeout: 5 });
  });

  it("revolving debt = cards + margin, and reconciles with net-worth liabilities", async () => {
    const liq = await call.cube.liquidity();

    // The split is internally consistent (decimal-exact).
    expect(liq.revolvingDebt).toBe(addMoney(liq.cards, liq.margin));
    expect(liq.net).toBe(subMoney(liq.cash, liq.revolvingDebt));

    // Revolving debt is the whole liability side of the balance sheet — it must
    // equal the net-worth roll-up's total liabilities (same account snapshots).
    const nw = await call.cube.netWorth();
    expect(liq.revolvingDebt).toBe(sumMoney([nw.totalLiabilities]));

    // Debts are positive magnitudes, largest first, and sum back to revolving debt.
    for (const d of liq.debts) expect(d.amount.startsWith("-")).toBe(false);
    const sorted = [...liq.debts].sort((a, b) => Number(b.amount) - Number(a.amount));
    expect(liq.debts).toEqual(sorted);
    if (liq.debts.length > 0) {
      expect(sumMoney(liq.debts.map((d) => d.amount))).toBe(liq.revolvingDebt);
    }
  });
});
