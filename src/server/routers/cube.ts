import { z } from "zod";

import {
  cubeCashFlowByCategory,
  cubeCategoryTree,
  cubeEquityCurve,
  cubeEtfDailySeries,
  cubeHoldingsList,
  cubeLiquidity,
  cubeMatchHealth,
  cubeNetWorth,
  cubeOpenPositionsList,
  cubePerformance,
  cubePropertyDailySeries,
  cubePropertyLedgerByCategory,
  cubePropertyList,
  cubeStrategyPerformance,
  cubeStructuresList,
  cubeSummary,
  cubeTradesList,
} from "@/lib/cube/cube";
import { CUBE_DIMENSIONS } from "@/lib/db/read-models/cube";

import { publicProcedure, router } from "../trpc";

const filter = z
  .object({
    underlying: z.string().optional(),
    instrumentType: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.number().int().positive().max(1000).optional(),
  })
  .optional();

/** The Cube — the unified, sliceable read model over reconstructed trades. */
export const cubeRouter = router({
  /** Headline totals over the (filtered) Cube. */
  summary: publicProcedure.input(filter).query(({ input }) => cubeSummary(input ?? {})),

  /** P&L + activity grouped by any Cube dimension — the slice. */
  performance: publicProcedure
    .input(z.object({ dimension: z.enum(CUBE_DIMENSIONS), filter }))
    .query(({ input }) => cubePerformance(input.dimension, input.filter ?? {})),

  /** The trade register — round-trips, filtered, newest first. */
  trades: publicProcedure.input(filter).query(({ input }) => cubeTradesList(input ?? {})),

  /** Strategy scorecard — P&L + power columns (%RoC/%RoR/Capital) grouped by strategy. */
  strategies: publicProcedure.input(filter).query(({ input }) => cubeStrategyPerformance(input ?? {})),

  /** The structure register — one row per strategy structure (the sortable HUD). */
  structures: publicProcedure.input(filter).query(({ input }) => cubeStructuresList(input ?? {})),

  /** The category tree — every fact bucketed into Income / Expenses / Transfers. */
  categoryTree: publicProcedure.query(() => cubeCategoryTree()),

  /** Match-health scorecard — the trust signal (matched vs unmatched). */
  matchHealth: publicProcedure.query(() => cubeMatchHealth()),

  /** Cumulative realized-P&L curve over time — the equity/waterfall curve. */
  equityCurve: publicProcedure.input(filter).query(({ input }) => cubeEquityCurve(input ?? {})),

  /** The covered-call ETF sleeve — held income positions (basis vs dividends vs mark). */
  holdings: publicProcedure.query(() => cubeHoldingsList()),

  /** Live open futures/equity positions, marked to market (empty when flat). */
  openPositions: publicProcedure.query(() => cubeOpenPositionsList()),

  /** One ETF's daily $ + % gain/loss series (Bob's spreadsheet charts, live). */
  etfDaily: publicProcedure
    .input(z.object({ symbol: z.string() }))
    .query(({ input }) => cubeEtfDailySeries(input.symbol)),

  /** Tracked real-estate assets — the home(s) with latest value / adjusted cost / equity. */
  properties: publicProcedure.query(() => cubePropertyList()),

  /** One property's daily value-vs-cost-vs-diff series (Bob's BolivarDr chart, live). */
  propertyDaily: publicProcedure
    .input(z.object({ propertyKey: z.string() }))
    .query(({ input }) => cubePropertyDailySeries(input.propertyKey)),

  /** One property's basis footprints by category (what's inflating/deflating the basis). */
  propertyLedger: publicProcedure
    .input(z.object({ propertyKey: z.string() }))
    .query(({ input }) => cubePropertyLedgerByCategory(input.propertyKey)),

  /** Broker money movement by category — deposits, interest, fees, dividends. */
  cashFlow: publicProcedure.query(() => cubeCashFlowByCategory()),

  /** The net-worth cockpit — assets − liabilities across every account, one roll-up. */
  netWorth: publicProcedure.query(() => cubeNetWorth()),

  /** The liquidity read — spendable cash vs revolving debt (cards + margin), the cash squeeze. */
  liquidity: publicProcedure.query(() => cubeLiquidity()),
});
