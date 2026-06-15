import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";

import { createAiRouter, suggestCategory } from "@/lib/ai";
import { getDb, schema } from "@/lib/db";
import { sumMoney, toScaled } from "@/lib/money";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";
import { isoDate, moneyString } from "../validators";

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
   * AI category suggestion (opt-in). Returns `{ enabled: false }` unless the AI
   * layer is turned on. Suggest-only: the result is for a human to confirm via
   * the `categorize` Action — it never writes.
   */
  suggest: publicProcedure
    .input(
      z.object({
        description: z.string(),
        amount: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const ai = createAiRouter();
      if (!ai.enabled) return { enabled: false as const, suggestion: null };
      const categories = await getDb()
        .select({ id: schema.category.id, name: schema.category.name })
        .from(schema.category);
      const suggestion = await suggestCategory(ai, {
        description: input.description,
        amount: input.amount,
        categories,
      });
      return { enabled: true as const, suggestion };
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
      txnDate: isoDate,
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
          txnDate: input.txnDate,
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
        txnDate: isoDate,
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
            txnDate: input.txnDate,
            categoryId: s.categoryId,
            amount: s.amount,
            note: s.note,
          })),
        )
        .returning();
    },
  }),
});
