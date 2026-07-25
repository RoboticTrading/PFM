import { z } from "zod";

import { getLedgerAccount, listLedgerAccounts } from "@/lib/db/read-models";

import { publicProcedure, router } from "../trpc";

export const accountsRouter = router({
  /**
   * Every account from the unified `cube.account` registry (checking, the 4
   * cards, brokerage), enriched with its institution + current
   * `cube.account_snapshot` balance. Name-ordered. `id` is the cube
   * `account_key` — the stable identity the rest of the app keys off.
   */
  list: publicProcedure.query(() => listLedgerAccounts()),

  /** A single cube account by its `account_key`, enriched, or null. */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => getLedgerAccount(input.id)),
});
