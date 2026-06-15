import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { sumMoney, toScaled } from "@/lib/money";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";
import { moneyString } from "../validators";

const txnRef = {
  sourceSchema: z.string().min(1),
  sourceTxnId: z.string().min(1),
};

const splitSchema = z.object({
  categoryId: z.string().uuid(),
  amount: moneyString,
  note: z.string().max(500).optional(),
});

export const categoriesRouter = router({
  /** The full category hierarchy (Income/Expense/Transfer + children). */
  list: publicProcedure.query(async () => {
    return getDb()
      .select({
        id: schema.category.id,
        parentId: schema.category.parentId,
        name: schema.category.name,
        kind: schema.category.kind,
      })
      .from(schema.category)
      .orderBy(asc(schema.category.kind), asc(schema.category.name));
  }),

  /** Existing categorization(s) for a source transaction (with names). */
  forTxn: publicProcedure
    .input(z.object(txnRef))
    .query(async ({ input }) => {
      return getDb()
        .select({
          id: schema.transactionCategory.id,
          categoryId: schema.transactionCategory.categoryId,
          categoryName: schema.category.name,
          amount: schema.transactionCategory.amount,
          note: schema.transactionCategory.note,
        })
        .from(schema.transactionCategory)
        .innerJoin(
          schema.category,
          eq(schema.transactionCategory.categoryId, schema.category.id),
        )
        .where(
          and(
            eq(schema.transactionCategory.sourceSchema, input.sourceSchema),
            eq(schema.transactionCategory.sourceTxnId, input.sourceTxnId),
          ),
        );
    }),

  /**
   * Assign a single category to a source transaction. Replaces any prior
   * categorization for the txn. References (sourceSchema, sourceTxnId) — the
   * source row is never copied.
   */
  categorize: defineAction({
    name: "categorize",
    input: z.object({
      ...txnRef,
      categoryId: z.string().uuid(),
      amount: moneyString,
      note: z.string().max(500).optional(),
    }),
    target: (input) => input.sourceTxnId,
    handler: async ({ input, tx }) => {
      await tx
        .delete(schema.transactionCategory)
        .where(
          and(
            eq(schema.transactionCategory.sourceSchema, input.sourceSchema),
            eq(schema.transactionCategory.sourceTxnId, input.sourceTxnId),
          ),
        );
      const [row] = await tx
        .insert(schema.transactionCategory)
        .values({
          sourceSchema: input.sourceSchema,
          sourceTxnId: input.sourceTxnId,
          categoryId: input.categoryId,
          amount: input.amount,
          note: input.note,
        })
        .returning();
      return row;
    },
  }),

  /**
   * Split a source transaction across multiple categories. The split amounts
   * must sum to `total` (the txn's amount). Replaces any prior categorization.
   */
  splitTransaction: defineAction({
    name: "splitTransaction",
    input: z
      .object({
        ...txnRef,
        total: moneyString,
        splits: z.array(splitSchema).min(2),
      })
      .superRefine((val, ctx) => {
        const sum = sumMoney(val.splits.map((s) => s.amount));
        if (toScaled(sum) !== toScaled(val.total)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Splits (${sum}) must sum to the transaction total (${val.total}).`,
            path: ["splits"],
          });
        }
      }),
    target: (input) => input.sourceTxnId,
    handler: async ({ input, tx }) => {
      await tx
        .delete(schema.transactionCategory)
        .where(
          and(
            eq(schema.transactionCategory.sourceSchema, input.sourceSchema),
            eq(schema.transactionCategory.sourceTxnId, input.sourceTxnId),
          ),
        );
      return tx
        .insert(schema.transactionCategory)
        .values(
          input.splits.map((s) => ({
            sourceSchema: input.sourceSchema,
            sourceTxnId: input.sourceTxnId,
            categoryId: s.categoryId,
            amount: s.amount,
            note: s.note,
          })),
        )
        .returning();
    },
  }),
});
