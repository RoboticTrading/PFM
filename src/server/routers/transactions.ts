import { z } from "zod";

import { accountRegister } from "@/lib/accounts/register";

import { publicProcedure, router } from "../trpc";

export const transactionsRouter = router({
  /**
   * Register rows for an account: canonical source transactions (RO) enriched
   * with their categorization. Read-only; lineage by source_txn_id.
   */
  forAccount: publicProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        limit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(({ input }) =>
      accountRegister(input.accountId, { limit: input.limit }),
    ),
});
