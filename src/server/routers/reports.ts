import { z } from "zod";

import { cashFlow, categoryReport, netWorth } from "@/lib/reports/reports";

import { publicProcedure, router } from "../trpc";
import { isoDate } from "../validators";

const dateRange = z.object({ from: isoDate, to: isoDate });

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
});
