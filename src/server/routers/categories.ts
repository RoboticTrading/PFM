import { TRPCError } from "@trpc/server";
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
      .orderBy(
        asc(schema.category.kind),
        asc(schema.category.sortOrder),
        asc(schema.category.name),
      );
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

  /** Create a category, optionally under a parent (top-level kinds are roots). */
  create: defineAction({
    name: "createCategory",
    input: z.object({
      name: z.string().min(1).max(120),
      kind: z.enum(schema.CATEGORY_KINDS),
      parentId: z.string().uuid().nullish(),
    }),
    target: (_input, output) => output.id,
    handler: async ({ input, tx }) => {
      const [row] = await tx
        .insert(schema.category)
        .values({
          name: input.name,
          kind: input.kind,
          parentId: input.parentId ?? null,
        })
        .returning();
      return row;
    },
  }),

  /** Rename a category. */
  rename: defineAction({
    name: "renameCategory",
    input: z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }),
    target: (input) => input.id,
    handler: async ({ input, tx }) => {
      const [row] = await tx
        .update(schema.category)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(schema.category.id, input.id))
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category not found." });
      }
      return row;
    },
  }),

  /** Delete a category — refused if it has children, budgets, or categorizations. */
  remove: defineAction({
    name: "deleteCategory",
    input: z.object({ id: z.string().uuid() }),
    target: (input) => input.id,
    handler: async ({ input, tx }) => {
      const child = await tx
        .select({ id: schema.category.id })
        .from(schema.category)
        .where(eq(schema.category.parentId, input.id))
        .limit(1);
      if (child.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Remove child categories first.",
        });
      }
      const used = await tx
        .select({ id: schema.transactionCategory.id })
        .from(schema.transactionCategory)
        .where(eq(schema.transactionCategory.categoryId, input.id))
        .limit(1);
      if (used.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category is used by transactions.",
        });
      }
      const budgeted = await tx
        .select({ id: schema.budget.id })
        .from(schema.budget)
        .where(eq(schema.budget.categoryId, input.id))
        .limit(1);
      if (budgeted.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category has budgets — remove them first.",
        });
      }
      await tx.delete(schema.category).where(eq(schema.category.id, input.id));
      return { id: input.id };
    },
  }),

  /** Set the manual display order of a sibling group (sortOrder = index). */
  reorder: defineAction({
    name: "reorderCategories",
    input: z.object({ ids: z.array(z.string().uuid()).min(1) }),
    target: (input) => input.ids[0],
    redact: (input) => ({ count: input.ids.length }),
    handler: async ({ input, tx }) => {
      for (let i = 0; i < input.ids.length; i++) {
        await tx
          .update(schema.category)
          .set({ sortOrder: i })
          .where(eq(schema.category.id, input.ids[i]));
      }
      return { count: input.ids.length };
    },
  }),

  /** Assign one category to many transactions at once (replaces each prior
   *  categorization). One audit row records the category + count. */
  categorizeBulk: defineAction({
    name: "categorizeBulk",
    input: z.object({
      categoryId: z.string().uuid(),
      txns: z
        .array(z.object({ ...txnRef, txnDate: isoDate, amount: moneyString }))
        .min(1)
        .max(1000),
    }),
    target: (input) => input.categoryId,
    redact: (input) => ({ categoryId: input.categoryId, count: input.txns.length }),
    handler: async ({ input, tx }) => {
      for (const t of input.txns) {
        await tx
          .delete(schema.transactionCategory)
          .where(
            and(
              eq(schema.transactionCategory.sourceSchema, t.sourceSchema),
              eq(schema.transactionCategory.sourceTxnId, t.sourceTxnId),
            ),
          );
        await tx.insert(schema.transactionCategory).values({
          sourceSchema: t.sourceSchema,
          sourceTxnId: t.sourceTxnId,
          txnDate: t.txnDate,
          categoryId: input.categoryId,
          amount: t.amount,
        });
      }
      return { count: input.txns.length };
    },
  }),
});
