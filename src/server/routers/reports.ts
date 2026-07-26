import { z } from "zod";

import {
  balanceSheet,
  cashFlow,
  cashFlowSeries,
  categoryReport,
  incomeStatement,
  netWorth,
} from "@/lib/reports/reports";

import { publicProcedure, router } from "../trpc";
import { isoDate } from "../validators";

const dateRange = z.object({ from: isoDate, to: isoDate });
const grain = z.enum(["week", "biweekly", "month", "quarter"]);
const windowed = z.object({ from: isoDate, to: isoDate, grain });

export const reportsRouter = router({
  /** Σ categorized amounts per category over a date range. */
  categoryReport: publicProcedure
    .input(dateRange)
    .query(({ input }) => categoryReport(input)),

  /** Income vs expense (+ transfers) over a date range. */
  cashFlow: publicProcedure
    .input(dateRange)
    .query(({ input }) => cashFlow(input)),

  /** Total net worth = Σ of every active account's current balance. */
  netWorth: publicProcedure.query(() => netWorth()),

  /**
   * Income/Expense (P&L): per-period income/expense/net + a category breakdown
   * over the range, with trading realized P&L folded into Income. Windowed by
   * Week / Bi-Weekly / Month / Quarter.
   */
  incomeStatement: publicProcedure
    .input(windowed)
    .query(({ input }) =>
      incomeStatement({ from: input.from, to: input.to }, input.grain),
    ),

  /** Cashflow: money in vs out per period + running cumulative net. */
  cashFlowSeries: publicProcedure
    .input(windowed)
    .query(({ input }) =>
      cashFlowSeries({ from: input.from, to: input.to }, input.grain),
    ),

  /** Balance Sheet: point-in-time assets vs liabilities + net worth (current). */
  balanceSheet: publicProcedure.query(() => balanceSheet()),
});
