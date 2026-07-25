import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  type CubeDimension,
  cubeCashFlows,
  cubeHoldings,
  cubeMatchRuns,
  cubeTrades,
} from "@/lib/db/read-models/cube";

export interface CubeFilter {
  underlying?: string;
  instrumentType?: string;
  from?: string; // inclusive ISO opened_at date
  to?: string;
  limit?: number;
}

const DIMENSION_COL = {
  underlying: cubeTrades.underlying,
  instrumentType: cubeTrades.instrumentType,
  direction: cubeTrades.direction,
  source: cubeTrades.source,
  account: cubeTrades.account,
} as const;

function whereClause(f: CubeFilter) {
  const parts = [];
  if (f.underlying) parts.push(eq(cubeTrades.underlying, f.underlying));
  if (f.instrumentType) parts.push(eq(cubeTrades.instrumentType, f.instrumentType));
  if (f.from) parts.push(gte(sql`${cubeTrades.openedAt}::date`, f.from));
  if (f.to) parts.push(lte(sql`${cubeTrades.openedAt}::date`, f.to));
  return parts.length ? and(...parts) : undefined;
}

export interface PerformanceRow {
  key: string;
  trades: number;
  contracts: number;
  realizedPnl: string;
  wins: number;
  first: string | null;
  last: string | null;
}

/** P&L + activity grouped by any Cube dimension — the sliceable heart of the Cube. */
export async function cubePerformance(
  dimension: CubeDimension,
  filter: CubeFilter = {},
): Promise<PerformanceRow[]> {
  const col = DIMENSION_COL[dimension];
  return getDb()
    .select({
      key: sql<string>`coalesce(${col}, '—')`,
      trades: sql<number>`count(*)::int`,
      contracts: sql<number>`coalesce(sum(${cubeTrades.qty}),0)::int`,
      realizedPnl: sql<string>`round(coalesce(sum(${cubeTrades.realizedPnl}),0)::numeric, 2)::text`,
      wins: sql<number>`count(*) filter (where ${cubeTrades.realizedPnl} > 0)::int`,
      first: sql<string | null>`min(${cubeTrades.openedAt})::date::text`,
      last: sql<string | null>`max(coalesce(${cubeTrades.closedAt}, ${cubeTrades.openedAt}))::date::text`,
    })
    .from(cubeTrades)
    .where(whereClause(filter))
    .groupBy(col)
    .orderBy(desc(sql`sum(${cubeTrades.realizedPnl})`));
}

export interface TradeRow {
  tradeId: number;
  source: string;
  symbol: string;
  instrumentType: string;
  underlying: string;
  direction: string;
  qty: number;
  openedAt: string;
  closedAt: string | null;
  heldDays: number | null;
  realizedPnl: string;
}

/** The trade register — round-trips, filtered, newest first. */
export async function cubeTradesList(filter: CubeFilter = {}): Promise<TradeRow[]> {
  return getDb()
    .select({
      tradeId: cubeTrades.tradeId,
      source: cubeTrades.source,
      symbol: cubeTrades.symbol,
      instrumentType: cubeTrades.instrumentType,
      underlying: cubeTrades.underlying,
      direction: cubeTrades.direction,
      qty: cubeTrades.qty,
      openedAt: sql<string>`${cubeTrades.openedAt}::text`,
      closedAt: sql<string | null>`${cubeTrades.closedAt}::text`,
      heldDays: cubeTrades.heldDays,
      realizedPnl: sql<string>`round(${cubeTrades.realizedPnl}::numeric,2)::text`,
    })
    .from(cubeTrades)
    .where(whereClause(filter))
    .orderBy(desc(cubeTrades.openedAt))
    .limit(Math.min(filter.limit ?? 200, 1000)) as Promise<TradeRow[]>;
}

export interface CubeSummary {
  trades: number;
  contracts: number;
  realizedPnl: string;
  wins: number;
  winRate: number;
  first: string | null;
  last: string | null;
  underlyings: number;
}

/** Headline totals over the whole (filtered) Cube. */
export async function cubeSummary(filter: CubeFilter = {}): Promise<CubeSummary> {
  const [r] = await getDb()
    .select({
      trades: sql<number>`count(*)::int`,
      contracts: sql<number>`coalesce(sum(${cubeTrades.qty}),0)::int`,
      realizedPnl: sql<string>`round(coalesce(sum(${cubeTrades.realizedPnl}),0)::numeric,2)::text`,
      wins: sql<number>`count(*) filter (where ${cubeTrades.realizedPnl} > 0)::int`,
      first: sql<string | null>`min(${cubeTrades.openedAt})::date::text`,
      last: sql<string | null>`max(coalesce(${cubeTrades.closedAt},${cubeTrades.openedAt}))::date::text`,
      underlyings: sql<number>`count(distinct ${cubeTrades.underlying})::int`,
    })
    .from(cubeTrades)
    .where(whereClause(filter));
  const winRate = r.trades ? r.wins / r.trades : 0;
  return { ...r, winRate };
}

export interface MatchHealth {
  source: string;
  runAt: string | null;
  fills: number;
  roundTrips: number;
  leftovers: number;
  matchRate: number;
}

/** The trust panel — latest match run per source (matched vs unmatched). */
export async function cubeMatchHealth(): Promise<MatchHealth[]> {
  const rows = await getDb()
    .select({
      source: cubeMatchRuns.source,
      runAt: sql<string | null>`${cubeMatchRuns.runAt}::text`,
      fills: cubeMatchRuns.fills,
      roundTrips: cubeMatchRuns.roundTrips,
      leftovers: cubeMatchRuns.leftovers,
    })
    .from(cubeMatchRuns)
    .orderBy(desc(cubeMatchRuns.runAt));
  // latest per source
  const seen = new Set<string>();
  const out: MatchHealth[] = [];
  for (const r of rows) {
    const source = r.source ?? "unknown";
    if (seen.has(source)) continue;
    seen.add(source);
    const denom = (r.roundTrips ?? 0) * 2 + (r.leftovers ?? 0);
    out.push({
      source,
      runAt: r.runAt,
      fills: r.fills ?? 0,
      roundTrips: r.roundTrips ?? 0,
      leftovers: r.leftovers ?? 0,
      matchRate: denom ? ((r.roundTrips ?? 0) * 2) / denom : 0,
    });
  }
  return out;
}

export interface HoldingRow {
  symbol: string;
  shares: string;
  cashCostBasis: string;
  dividendsReceived: string;
  netBasis: string;
  pctCapitalReturned: string;
  nDividends: number;
}

/** The covered-call ETF sleeve — held income positions, basis vs dividends collected. */
export async function cubeHoldingsList(): Promise<HoldingRow[]> {
  return getDb()
    .select({
      symbol: cubeHoldings.symbol,
      shares: sql<string>`${cubeHoldings.shares}::text`,
      cashCostBasis: sql<string>`round(${cubeHoldings.cashCostBasis}::numeric,2)::text`,
      dividendsReceived: sql<string>`round(${cubeHoldings.dividendsReceived}::numeric,2)::text`,
      netBasis: sql<string>`round(${cubeHoldings.netBasis}::numeric,2)::text`,
      pctCapitalReturned: sql<string>`round(${cubeHoldings.pctCapitalReturned}::numeric,1)::text`,
      nDividends: sql<number>`coalesce(${cubeHoldings.nDividends},0)::int`,
    })
    .from(cubeHoldings)
    .orderBy(desc(cubeHoldings.dividendsReceived)) as Promise<HoldingRow[]>;
}

export interface CashFlowRow {
  category: string;
  inflow: string;
  outflow: string;
  net: string;
  n: number;
}

/** Broker money movement grouped by category — deposits, interest, fees, dividends. */
export async function cubeCashFlowByCategory(): Promise<CashFlowRow[]> {
  return getDb()
    .select({
      category: sql<string>`coalesce(${cubeCashFlows.category},'—')`,
      inflow: sql<string>`round(sum(${cubeCashFlows.amount}) filter (where ${cubeCashFlows.amount} > 0)::numeric,2)::text`,
      outflow: sql<string>`round(sum(${cubeCashFlows.amount}) filter (where ${cubeCashFlows.amount} < 0)::numeric,2)::text`,
      net: sql<string>`round(sum(${cubeCashFlows.amount})::numeric,2)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(cubeCashFlows)
    .groupBy(cubeCashFlows.category)
    .orderBy(desc(sql`abs(sum(${cubeCashFlows.amount}))`));
}
