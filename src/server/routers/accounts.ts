import { z } from "zod";

import { schema } from "@/lib/db";
import { getLedgerAccount, listLedgerAccounts } from "@/lib/db/read-models";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";
import { isoDate, moneyString } from "../validators";

/** Kinds whose balance represents money owed (drives the net-worth sign) when not passed. */
const LIABILITY_KINDS = new Set(["credit-card"]);

export const accountsRouter = router({
  /**
   * Every account from the unified `cube.account` registry (checking, the 4
   * cards, brokerage), enriched with its institution + current
   * `financialmanager.account_balance` balance. Name-ordered. `id` is the cube
   * `account_key` — the stable identity the rest of the app keys off.
   */
  list: publicProcedure.query(() => listLedgerAccounts()),

  /** A single cube account by its `account_key`, enriched, or null. */
  byId: publicProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ input }) => getLedgerAccount(input.id)),

  /**
   * Set (or update) an account's owner-editable current balance. Upserts into
   * `financialmanager.account_balance` on `account_key`, audited. `isLiability`
   * is taken from the input when given, else inferred from `kind`, else the
   * existing/false default. This is the ONE write path for the balances the
   * net-worth + liquidity readers consume.
   */
  setBalance: defineAction({
    name: "setAccountBalance",
    input: z.object({
      accountKey: z.string().min(1),
      balance: moneyString,
      asOfDate: isoDate,
      isLiability: z.boolean().optional(),
      kind: z.string().optional(),
      name: z.string().optional(),
    }),
    target: (input) => input.accountKey,
    handler: async ({ input, tx }) => {
      const inferredLiability =
        input.isLiability ??
        (input.kind ? LIABILITY_KINDS.has(input.kind) : false);

      // Only overwrite name/kind/is_liability on conflict when the caller
      // actually supplied them — otherwise preserve the stored row.
      const set: Record<string, unknown> = {
        balance: input.balance,
        asOfDate: input.asOfDate,
        updatedAt: new Date(),
      };
      if (input.name !== undefined) set.name = input.name;
      if (input.kind !== undefined) set.kind = input.kind;
      if (input.isLiability !== undefined || input.kind !== undefined) {
        set.isLiability = inferredLiability;
      }

      const [row] = await tx
        .insert(schema.accountBalance)
        .values({
          accountKey: input.accountKey,
          name: input.name ?? null,
          kind: input.kind ?? null,
          balance: input.balance,
          asOfDate: input.asOfDate,
          isLiability: inferredLiability,
        })
        .onConflictDoUpdate({
          target: schema.accountBalance.accountKey,
          set,
        })
        .returning();
      return row;
    },
  }),
});
