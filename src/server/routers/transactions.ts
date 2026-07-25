import { z } from "zod";

import { accountRegister } from "@/lib/accounts/register";

import { publicProcedure, router } from "../trpc";

export const transactionsRouter = router({
  /**
   * Register rows for an account: canonical ledger transactions (RO, from
   * `cube.v_ledger`) enriched with their categorization. `accountId` is the cube
   * `account_key`; the {@link ALL_ACCOUNTS} sentinel streams every account
   * unified. Read-only; lineage by (source_schema, source_txn_id).
   */
  forAccount: publicProcedure
    .input(
      z.object({
        accountId: z.string().min(1),
        limit: z.number().int().min(1).max(1000).default(200),
      }),
    )
    .query(({ input }) =>
      accountRegister(input.accountId, { limit: input.limit }),
    ),
});
