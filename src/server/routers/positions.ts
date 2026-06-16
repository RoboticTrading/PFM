import { TRPCError } from "@trpc/server";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { listPositionHistory } from "@/lib/db/read-models";
import { positionHistory, vTradeTransactions } from "@/lib/db/read-models/schemas";

import { defineAction } from "../actions/defineAction";
import { publicProcedure, router } from "../trpc";
import { isoDate, moneyString } from "../validators";

const pfmPositionColumns = {
  id: schema.position.id,
  symbol: schema.position.symbol,
  instrumentClass: schema.position.instrumentClass,
  structureType: schema.position.structureType,
  status: schema.position.status,
  openedAt: schema.position.openedAt,
};

const legInput = z.object({
  sourceSchema: z.string().min(1).default("schwab_brokerage"),
  sourceFillId: z.string().min(1),
  side: z.enum(schema.POSITION_LEG_SIDES),
  quantity: moneyString,
  price: moneyString,
});

export const positionsRouter = router({
  /** trade_analysis.position_history (read-only) — the source position record. */
  history: publicProcedure
    .input(
      z
        .object({
          openOnly: z.boolean().default(false),
          limit: z.number().int().min(1).max(500).default(100),
        })
        .default({ openOnly: false, limit: 100 }),
    )
    .query(({ input }) => listPositionHistory(input)),

  /** PFM's own paired positions, symbol-ordered. */
  list: publicProcedure.query(async () => {
    return getDb()
      .select(pfmPositionColumns)
      .from(schema.position)
      .orderBy(asc(schema.position.symbol));
  }),

  /** Open PFM positions (status = open). */
  open: publicProcedure.query(async () => {
    return getDb()
      .select(pfmPositionColumns)
      .from(schema.position)
      .where(eq(schema.position.status, "open"))
      .orderBy(asc(schema.position.symbol));
  }),

  /** PFM positions not yet linked to a trade_analysis.position_history row. */
  unmatched: publicProcedure.query(async () => {
    return getDb()
      .select(pfmPositionColumns)
      .from(schema.position)
      .leftJoin(
        schema.positionLink,
        eq(schema.positionLink.positionId, schema.position.id),
      )
      .where(isNull(schema.positionLink.id))
      .orderBy(asc(schema.position.symbol));
  }),

  /** A PFM position with its paired legs. */
  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      const db = getDb();
      const [position] = await db
        .select()
        .from(schema.position)
        .where(eq(schema.position.id, input.id))
        .limit(1);
      if (!position) return null;
      const legs = await db
        .select()
        .from(schema.positionLeg)
        .where(eq(schema.positionLeg.positionId, input.id));
      return { position, legs };
    }),

  /** Recent schwab trade fills available to pair into a position (read-only). */
  availableFills: publicProcedure
    .input(
      z
        .object({ limit: z.number().int().min(1).max(500).default(150) })
        .default({ limit: 150 }),
    )
    .query(({ input }) =>
      getDb()
        .select({
          activityId: vTradeTransactions.activityId,
          tradeDate: vTradeTransactions.tradeDate,
          symbol: vTradeTransactions.symbol,
          type: vTradeTransactions.type,
          positionEffect: vTradeTransactions.positionEffect,
          quantity: vTradeTransactions.amount,
          price: vTradeTransactions.price,
          description: vTradeTransactions.description,
        })
        .from(vTradeTransactions)
        .orderBy(desc(vTradeTransactions.tradeDate))
        .limit(input.limit),
    ),

  /**
   * Pair source fills into a new manual Position with PositionLegs. Each leg
   * references its source fill (sourceSchema, sourceFillId) — fills are never
   * copied. Carries the instrument class + trade-structure taxonomy.
   */
  pair: defineAction({
    name: "pairFillsIntoPosition",
    input: z.object({
      symbol: z.string().min(1),
      instrumentClass: z.string().min(1),
      structureType: z.string().optional(),
      structureSubtype: z.string().optional(),
      openedAt: isoDate.optional(),
      notes: z.string().max(1000).optional(),
      legs: z.array(legInput).min(1),
    }),
    target: (_input, output) => output.positionId,
    handler: async ({ input, tx }) => {
      const [position] = await tx
        .insert(schema.position)
        .values({
          symbol: input.symbol,
          instrumentClass: input.instrumentClass,
          structureType: input.structureType,
          structureSubtype: input.structureSubtype,
          openedAt: input.openedAt,
          notes: input.notes,
        })
        .returning();

      const legs = await tx
        .insert(schema.positionLeg)
        .values(
          input.legs.map((l) => ({
            positionId: position.id,
            sourceSchema: l.sourceSchema,
            sourceFillId: l.sourceFillId,
            side: l.side,
            quantity: l.quantity,
            price: l.price,
          })),
        )
        .returning();

      return { positionId: position.id, legCount: legs.length };
    },
  }),

  /**
   * Link a PFM Position to a trade_analysis.position_history row (read-only
   * source). Verifies the source row exists; stores only the reference.
   */
  linkPosition: defineAction({
    name: "linkPosition",
    input: z.object({
      positionId: z.string().uuid(),
      positionHistoryId: z.string().uuid(),
    }),
    target: (input) => input.positionId,
    handler: async ({ input, tx }) => {
      const found = await tx
        .select({ id: positionHistory.positionId })
        .from(positionHistory)
        .where(eq(positionHistory.positionId, input.positionHistoryId))
        .limit(1);
      if (found.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `position_history ${input.positionHistoryId} not found.`,
        });
      }
      const [row] = await tx
        .insert(schema.positionLink)
        .values({
          positionId: input.positionId,
          positionHistoryId: input.positionHistoryId,
        })
        .returning();
      return row;
    },
  }),
});
