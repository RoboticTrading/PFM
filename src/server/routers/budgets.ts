import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { budgetVsActual } from "@/lib/reports/budget";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";
import { moneyString } from "../validators";

/** Budget period: a year ("2026") or month ("2026-06"). */
const period = z.string().regex(/^\d{4}(-\d{2})?$/, "period must be YYYY or YYYY-MM");

export const budgetsRouter = router({
  /** All budgets with their category, period-ordered. */
  list: publicProcedure.query(async () => {
    return getDb()
      .select({
        id: schema.budget.id,
        categoryId: schema.budget.categoryId,
        categoryName: schema.category.name,
        period: schema.budget.period,
        amount: schema.budget.amount,
      })
      .from(schema.budget)
      .innerJoin(
        schema.category,
        eq(schema.budget.categoryId, schema.category.id),
      )
      .orderBy(asc(schema.budget.period));
  }),

  /** Budget vs actual for a period. */
  vsActual: publicProcedure
    .input(z.object({ period }))
    .query(({ input }) => budgetVsActual(input.period)),

  /** Set (or update) a category's budget for a period. */
  setBudget: defineAction({
    name: "setBudget",
    input: z.object({
      categoryId: z.string().uuid(),
      period,
      amount: moneyString,
    }),
    target: (input) => input.categoryId,
    handler: async ({ input, tx }) => {
      const [row] = await tx
        .insert(schema.budget)
        .values({
          categoryId: input.categoryId,
          period: input.period,
          amount: input.amount,
        })
        .onConflictDoUpdate({
          target: [schema.budget.categoryId, schema.budget.period],
          set: { amount: input.amount, updatedAt: new Date() },
        })
        .returning();
      return row;
    },
  }),
});
