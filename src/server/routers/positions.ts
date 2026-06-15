import { z } from "zod";

import { listPositionHistory } from "@/lib/db/read-models";

import { publicProcedure, router } from "../trpc";

export const positionsRouter = router({
  /**
   * trade_analysis.position_history (read-only) — the source of truth for the
   * Positions artifact until PFM's own positions are paired (Phase 6).
   */
  history: publicProcedure
    .input(
      z
        .object({
          openOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({ openOnly: false, limit: 100 }),
    )
    .query(({ input }) => listPositionHistory(input)),
});
