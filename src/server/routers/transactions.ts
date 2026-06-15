import { z } from "zod";

import { accountTransactions } from "@/lib/accounts/transactions";

import { publicProcedure, router } from "../trpc";

export const transactionsRouter = router({
  /** Canonical transactions for an account (read-only over the source view). */
  forAccount: publicProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        limit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(({ input }) =>
      accountTransactions(input.accountId, { limit: input.limit }),
    ),
});
