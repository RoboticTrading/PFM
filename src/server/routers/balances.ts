import { z } from "zod";

import { accountBalance } from "@/lib/accounts/balance";
import { schema } from "@/lib/db";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";

const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "amount must be a decimal string");
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "asOfDate must be YYYY-MM-DD");

export const balancesRouter = router({
  /** Set (or update) the known balance for an account as of a date. */
  setForward: defineAction({
    name: "setBalanceForward",
    input: z.object({
      accountId: z.string().uuid(),
      asOfDate: isoDate,
      amount: moneyString,
    }),
    target: (input) => input.accountId,
    handler: async ({ input, tx }) => {
      const [row] = await tx
        .insert(schema.balanceForward)
        .values({
          accountId: input.accountId,
          asOfDate: input.asOfDate,
          amount: input.amount,
        })
        .onConflictDoUpdate({
          target: [
            schema.balanceForward.accountId,
            schema.balanceForward.asOfDate,
          ],
          set: { amount: input.amount, updatedAt: new Date() },
        })
        .returning();
      return row;
    },
  }),

  /** Current balance = latest balance-forward + Σ source transactions since. */
  forAccount: publicProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .query(({ input }) => accountBalance(input.accountId)),
});
