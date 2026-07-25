import { z } from "zod";

import {
  cubeMatchHealth,
  cubePerformance,
  cubeSummary,
  cubeTradesList,
} from "@/lib/cube/cube";
import { CUBE_DIMENSIONS } from "@/lib/db/read-models/cube";

import { publicProcedure, router } from "../trpc";

const filter = z
  .object({
    underlying: z.string().optional(),
    instrumentType: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  })
  .optional();

/** The Cube — the unified, sliceable read model over reconstructed trades. */
export const cubeRouter = router({
  /** Headline totals over the (filtered) Cube. */
  summary: publicProcedure.input(filter).query(({ input }) => cubeSummary(input ?? {})),

  /** P&L + activity grouped by any Cube dimension — the slice. */
  performance: publicProcedure
    .input(z.object({ dimension: z.enum(CUBE_DIMENSIONS), filter }))
    .query(({ input }) => cubePerformance(input.dimension, input.filter ?? {})),

  /** The trade register — round-trips, filtered, newest first. */
  trades: publicProcedure.input(filter).query(({ input }) => cubeTradesList(input ?? {})),

  /** Match-health scorecard — the trust signal (matched vs unmatched). */
  matchHealth: publicProcedure.query(() => cubeMatchHealth()),
});
