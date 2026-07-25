import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { accountBalance } from "@/lib/db/read-models/account-balance";
import {
  type CubeDimension,
  cubeCashFlows,
  cubeHoldings,
  cubeEtfDaily,
  cubeMatchRuns,
  cubeOpenPositions,
  cubeProperty,
  cubePropertyDaily,
  cubePropertyLedger,
  cubeStructures,
  cubeTrades,
} from "@/lib/db/read-models/cube";
import { addMoney, subMoney, sumMoney } from "@/lib/money";

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
  mark: string | null;
  markAt: string | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
  totalReturn: string | null;
  totalReturnPct: string | null;
}

/** The covered-call ETF sleeve — held income positions, basis vs dividends vs current mark-to-market. */
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
      mark: sql<string | null>`${cubeHoldings.mark}::text`,
      markAt: sql<string | null>`${cubeHoldings.markAt}::date::text`,
      marketValue: sql<string | null>`round(${cubeHoldings.marketValue}::numeric,2)::text`,
      unrealizedPnl: sql<string | null>`round(${cubeHoldings.unrealizedPnl}::numeric,2)::text`,
      totalReturn: sql<string | null>`round(${cubeHoldings.totalReturn}::numeric,2)::text`,
      totalReturnPct: sql<string | null>`${cubeHoldings.totalReturnPct}::text`,
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

// ─── Structures: the strategy HUD + power columns (Bob's Excel, live) ──────────────────

function structWhere(f: CubeFilter) {
  const parts = [];
  if (f.underlying) parts.push(eq(cubeStructures.underlying, f.underlying));
  if (f.from) parts.push(gte(sql`${cubeStructures.openedAt}::date`, f.from));
  if (f.to) parts.push(lte(sql`${cubeStructures.openedAt}::date`, f.to));
  return parts.length ? and(...parts) : undefined;
}

export interface StrategyRow {
  strategy: string;
  n: number;
  realizedPnl: string;
  wins: number;
  winRate: number;
  avgRoc: string | null; // % return on capital
  avgRor: string | null; // % return on risk
  capital: string | null; // total capital deployed (defined-risk structures)
  avgHeldDays: string | null;
}

/** P&L + the power columns grouped by strategy — the strategy scorecard. */
export async function cubeStrategyPerformance(filter: CubeFilter = {}): Promise<StrategyRow[]> {
  const rows = await getDb()
    .select({
      strategy: sql<string>`coalesce(${cubeStructures.strategy},'—')`,
      n: sql<number>`count(*)::int`,
      realizedPnl: sql<string>`round(coalesce(sum(${cubeStructures.realizedPnl}),0)::numeric,2)::text`,
      wins: sql<number>`count(*) filter (where ${cubeStructures.realizedPnl} > 0)::int`,
      avgRoc: sql<string | null>`round(avg(${cubeStructures.roc})*100,1)::text`,
      avgRor: sql<string | null>`round(avg(${cubeStructures.ror})*100,1)::text`,
      capital: sql<string | null>`round(sum(${cubeStructures.capital})::numeric,0)::text`,
      avgHeldDays: sql<string | null>`round(avg(${cubeStructures.heldDays}),1)::text`,
    })
    .from(cubeStructures)
    .where(structWhere(filter))
    .groupBy(cubeStructures.strategy)
    .orderBy(desc(sql`count(*)`));
  return rows.map((r) => ({ ...r, winRate: r.n ? r.wins / r.n : 0 }));
}

export interface StructureRow {
  structureId: number;
  source: string;
  underlying: string;
  strategy: string;
  legs: number;
  qty: number;
  openedAt: string;
  closedAt: string | null;
  heldDays: number | null;
  realizedPnl: string;
  capital: string | null;
  maxLoss: string | null;
  roc: string | null; // % (already ×100)
  ror: string | null;
  status: string;
}

/** The strategy register — one row per structure, newest first (the sortable HUD). */
export async function cubeStructuresList(filter: CubeFilter = {}): Promise<StructureRow[]> {
  const parts = [structWhere(filter)];
  if (filter.instrumentType) parts.push(eq(cubeStructures.strategy, filter.instrumentType));
  return getDb()
    .select({
      structureId: cubeStructures.structureId,
      source: sql<string>`coalesce(${cubeStructures.source},'—')`,
      underlying: sql<string>`coalesce(${cubeStructures.underlying},'—')`,
      strategy: sql<string>`coalesce(${cubeStructures.strategy},'—')`,
      legs: sql<number>`coalesce(${cubeStructures.legs},0)::int`,
      qty: sql<number>`coalesce(${cubeStructures.qty},0)::int`,
      openedAt: sql<string>`${cubeStructures.openedAt}::text`,
      closedAt: sql<string | null>`${cubeStructures.closedAt}::text`,
      heldDays: cubeStructures.heldDays,
      realizedPnl: sql<string>`round(${cubeStructures.realizedPnl}::numeric,2)::text`,
      capital: sql<string | null>`round(${cubeStructures.capital}::numeric,0)::text`,
      maxLoss: sql<string | null>`round(${cubeStructures.maxLoss}::numeric,0)::text`,
      roc: sql<string | null>`round(${cubeStructures.roc}*100,1)::text`,
      ror: sql<string | null>`round(${cubeStructures.ror}*100,1)::text`,
      status: sql<string>`coalesce(${cubeStructures.status},'closed')`,
    })
    .from(cubeStructures)
    .where(and(...parts.filter(Boolean)))
    .orderBy(desc(cubeStructures.openedAt))
    .limit(Math.min(filter.limit ?? 300, 1000)) as Promise<StructureRow[]>;
}

export interface CategoryNode {
  path: string; // " / "-delimited, e.g. "Income / Trading / Options / Bull Put Spread"
  amount: string;
  n: number;
}

/**
 * The category tree — every Cube fact bucketed into Income / Expenses / Transfers, per Bob's ask.
 * Trading structures roll up under their strategy path; broker cash flows join under Income/Expenses
 * by their rollup. Settlement (futures mark-to-market) is excluded — it's the cash side of futures
 * trade P&L, already counted in Trading. Returns flat rows; the client assembles the tree.
 */
export async function cubeCategoryTree(): Promise<CategoryNode[]> {
  const db = getDb();
  const [trading, flows] = await Promise.all([
    db
      .select({
        path: sql<string>`coalesce(${cubeStructures.category},'Income / Trading / Other')`,
        amount: sql<string>`round(sum(${cubeStructures.realizedPnl})::numeric,2)::text`,
        n: sql<number>`count(*)::int`,
      })
      .from(cubeStructures)
      .groupBy(cubeStructures.category),
    db
      .select({
        path: sql<string>`case ${cubeCashFlows.rollup}
            when 'income'  then 'Income / Broker / '   || initcap(coalesce(${cubeCashFlows.category},'other'))
            when 'expense' then 'Expenses / Broker / ' || initcap(coalesce(${cubeCashFlows.category},'other'))
            when 'transfer' then 'Transfers / '        || initcap(coalesce(${cubeCashFlows.category},'other'))
          end`,
        amount: sql<string>`round(sum(${cubeCashFlows.amount})::numeric,2)::text`,
        n: sql<number>`count(*)::int`,
      })
      .from(cubeCashFlows)
      .where(sql`${cubeCashFlows.rollup} in ('income','expense','transfer')`)
      .groupBy(cubeCashFlows.rollup, cubeCashFlows.category),
  ]);
  return [...trading, ...flows].filter((r) => r.path) as CategoryNode[];
}

// ─── Real estate: the house as a marked-to-market asset (Bob's BolivarDr model) ────────

export interface PropertyRow {
  propertyKey: string;
  label: string;
  address: string;
  kind: string;
  value: string | null;
  adjustedCost: string | null;
  diff: string | null;
  asOf: string | null;
}

/** The tracked assets (real estate + vehicles) with their latest value / adjusted cost / equity diff. */
export async function cubePropertyList(): Promise<PropertyRow[]> {
  return getDb()
    .select({
      propertyKey: cubeProperty.propertyKey,
      label: sql<string>`coalesce(${cubeProperty.label},'—')`,
      address: sql<string>`coalesce(${cubeProperty.address},'')`,
      kind: sql<string>`coalesce(${cubeProperty.kind},'real_estate')`,
      value: sql<string | null>`round((SELECT pd.value FROM cube.property_daily pd
        WHERE pd.property_key = ${cubeProperty.propertyKey} ORDER BY pd.d DESC LIMIT 1)::numeric,2)::text`,
      adjustedCost: sql<string | null>`round((SELECT pd.adjusted_cost FROM cube.property_daily pd
        WHERE pd.property_key = ${cubeProperty.propertyKey} ORDER BY pd.d DESC LIMIT 1)::numeric,2)::text`,
      diff: sql<string | null>`round((SELECT pd.diff FROM cube.property_daily pd
        WHERE pd.property_key = ${cubeProperty.propertyKey} ORDER BY pd.d DESC LIMIT 1)::numeric,2)::text`,
      asOf: sql<string | null>`(SELECT pd.d FROM cube.property_daily pd
        WHERE pd.property_key = ${cubeProperty.propertyKey} ORDER BY pd.d DESC LIMIT 1)::text`,
    })
    .from(cubeProperty)
    .where(sql`${cubeProperty.active} IS NULL OR ${cubeProperty.active}::bool`)
    .orderBy(cubeProperty.kind, cubeProperty.label) as Promise<PropertyRow[]>;
}

export interface PropertyDailyPoint {
  d: string;
  value: number | null;
  adjustedCost: number;
  diff: number | null;
}

/** The house daily series — value vs adjusted cost vs diff, for the chart. */
export async function cubePropertyDailySeries(propertyKey: string): Promise<PropertyDailyPoint[]> {
  return getDb()
    .select({
      d: sql<string>`${cubePropertyDaily.d}::text`,
      value: sql<number | null>`${cubePropertyDaily.value}::float8`,
      adjustedCost: sql<number>`${cubePropertyDaily.adjustedCost}::float8`,
      diff: sql<number | null>`${cubePropertyDaily.diff}::float8`,
    })
    .from(cubePropertyDaily)
    .where(eq(cubePropertyDaily.propertyKey, propertyKey))
    .orderBy(cubePropertyDaily.d) as Promise<PropertyDailyPoint[]>;
}

export interface PropertyLedgerCategory {
  category: string;
  effect: string;
  total: string;
  n: number;
}

/** The basis footprints grouped by category — what's inflating/deflating the house basis. */
export async function cubePropertyLedgerByCategory(propertyKey: string): Promise<PropertyLedgerCategory[]> {
  return getDb()
    .select({
      category: sql<string>`coalesce(${cubePropertyLedger.category},'—')`,
      effect: sql<string>`max(${cubePropertyLedger.effect})`,
      total: sql<string>`round(sum(${cubePropertyLedger.amount})::numeric,2)::text`,
      n: sql<number>`count(*)::int`,
    })
    .from(cubePropertyLedger)
    .where(eq(cubePropertyLedger.propertyKey, propertyKey))
    .groupBy(cubePropertyLedger.category)
    .orderBy(desc(sql`abs(sum(${cubePropertyLedger.amount}))`)) as Promise<PropertyLedgerCategory[]>;
}

export interface EtfDailyPoint {
  d: string;
  gain: number; // $ gain/loss (value − net cost)
  gainPct: number; // % gain/loss
  marketValue: number;
  netCost: number;
  close: number;
}

/** Bob's ETF sheet reproduced — the daily $ and % gain/loss series for one ETF (its two curves). */
export async function cubeEtfDailySeries(symbol: string): Promise<EtfDailyPoint[]> {
  const rows = await getDb()
    .select({
      d: sql<string>`${cubeEtfDaily.d}::text`,
      gain: sql<number>`${cubeEtfDaily.gain}::float8`,
      gainPct: sql<number>`coalesce(${cubeEtfDaily.gainPct},0)::float8`,
      marketValue: sql<number>`${cubeEtfDaily.marketValue}::float8`,
      netCost: sql<number>`${cubeEtfDaily.netCost}::float8`,
      close: sql<number>`${cubeEtfDaily.close}::float8`,
    })
    .from(cubeEtfDaily)
    .where(eq(cubeEtfDaily.symbol, symbol))
    .orderBy(cubeEtfDaily.d);
  return rows as EtfDailyPoint[];
}

export interface OpenPositionRow {
  symbol: string;
  kind: string;
  qty: string;
  direction: string;
  avgCost: string | null;
  mark: string | null;
  markAt: string | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
}

/** Live open futures/equity positions, marked to market — empty when the book is flat. */
export async function cubeOpenPositionsList(): Promise<OpenPositionRow[]> {
  return getDb()
    .select({
      symbol: cubeOpenPositions.symbol,
      kind: sql<string>`coalesce(${cubeOpenPositions.kind},'—')`,
      qty: sql<string>`${cubeOpenPositions.qty}::text`,
      direction: sql<string>`coalesce(${cubeOpenPositions.direction},'—')`,
      avgCost: sql<string | null>`round(${cubeOpenPositions.avgCost}::numeric,2)::text`,
      mark: sql<string | null>`${cubeOpenPositions.mark}::text`,
      markAt: sql<string | null>`${cubeOpenPositions.markAt}::date::text`,
      marketValue: sql<string | null>`round(${cubeOpenPositions.marketValue}::numeric,2)::text`,
      unrealizedPnl: sql<string | null>`round(${cubeOpenPositions.unrealizedPnl}::numeric,2)::text`,
    })
    .from(cubeOpenPositions)
    .orderBy(desc(sql`abs(coalesce(${cubeOpenPositions.unrealizedPnl},0))`)) as Promise<OpenPositionRow[]>;
}

// ─── Net worth: the cockpit roll-up (assets − liabilities across every account) ──────────

export interface NetWorthLine {
  label: string;
  /** USD money string, positive magnitude (liabilities are shown as what's owed). */
  amount: string;
}

export interface NetWorth {
  assets: NetWorthLine[];
  liabilities: NetWorthLine[];
  totalAssets: string;
  totalLiabilities: string;
  netWorth: string;
  etfDividends: string; // income the covered-call sleeve has thrown off, all-time
}

/** strip a leading minus — turn a signed money string into its positive magnitude. */
function magnitude(value: string): string {
  return value.startsWith("-") ? value.slice(1) : value;
}

/**
 * The net-worth roll-up — Bob's whole balance sheet in one shot. Assets (house + ETF sleeve
 * market value + car + checking) minus liabilities (brokerage margin debit + credit cards).
 * The ETF sleeve and the margin both live in the Schwab brokerage account: the holdings are the
 * asset, the margin balance is the liability. Point-in-time balances come from the owner-editable
 * financialmanager.account_balance table; marked assets come from the live cube facts.
 */
export async function cubeNetWorth(): Promise<NetWorth> {
  const db = getDb();
  const [[sleeve], houseRow, carRow, accounts] = await Promise.all([
    db
      .select({
        marketValue: sql<string>`round(coalesce(sum(${cubeHoldings.marketValue}),0)::numeric,2)::text`,
        dividends: sql<string>`round(coalesce(sum(${cubeHoldings.dividendsReceived}),0)::numeric,2)::text`,
      })
      .from(cubeHoldings),
    db
      .select({ value: sql<string>`round(${cubePropertyDaily.value}::numeric,2)::text` })
      .from(cubePropertyDaily)
      .where(eq(cubePropertyDaily.propertyKey, "bolivar_dr"))
      .orderBy(desc(cubePropertyDaily.d))
      .limit(1),
    db
      .select({ value: sql<string>`round(${cubePropertyDaily.value}::numeric,2)::text` })
      .from(cubePropertyDaily)
      .where(eq(cubePropertyDaily.propertyKey, "ford_explorer"))
      .orderBy(desc(cubePropertyDaily.d))
      .limit(1),
    db
      .select({
        account: accountBalance.name,
        balance: sql<string>`round(${accountBalance.balance}::numeric,2)::text`,
        isLiability: accountBalance.isLiability,
      })
      .from(accountBalance)
      .orderBy(desc(sql`abs(${accountBalance.balance})`)),
  ]);

  const house = houseRow[0]?.value ?? "0";
  const car = carRow[0]?.value ?? "0";
  const cashAccounts = accounts.filter((a) => !a.isLiability);
  const liabilityAccounts = accounts.filter((a) => a.isLiability);

  const assets: NetWorthLine[] = [
    { label: "House · Bolivar Dr", amount: house },
    { label: "ETF sleeve (market value)", amount: sleeve.marketValue },
    { label: "Car · Ford Explorer", amount: car },
    ...cashAccounts.map((a) => ({ label: a.account ?? "—", amount: a.balance })),
  ];
  const liabilities: NetWorthLine[] = liabilityAccounts.map((a) => ({
    label: a.account ?? "—",
    amount: magnitude(a.balance),
  }));

  const totalAssets = sumMoney(assets.map((a) => a.amount));
  const totalLiabilities = sumMoney(liabilities.map((l) => l.amount));
  const netWorth = subMoney(totalAssets, totalLiabilities);

  return {
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    netWorth,
    etfDividends: sleeve.dividends,
  };
}

// ─── Liquidity: the cash-squeeze read (spendable cash vs revolving debt) ──────────────────

export interface LiquidityDebt {
  account: string;
  kind: string;
  /** Positive magnitude of what's owed. */
  amount: string;
}

export interface Liquidity {
  asOf: string | null;
  /** Liquid cash on hand (checking + any non-liability cash), signed. */
  cash: string;
  /** Credit-card revolving debt, magnitude. */
  cards: string;
  /** Brokerage margin debit, magnitude. */
  margin: string;
  /** cards + margin — everything owed that carries interest, magnitude. */
  revolvingDebt: string;
  /** cash − revolvingDebt — the true "spendable minus owed" position, signed. */
  net: string;
  /** The revolving-debt lines (cards + margin), largest first, magnitudes. */
  debts: LiquidityDebt[];
}

/**
 * The liquidity read — what Bob can actually spend right now (checking cash) against what he owes
 * on revolving credit (the cards + the brokerage margin debit). Net worth hides the cash squeeze
 * behind illiquid house/ETF equity; this surfaces it. All from the owner-editable account balances.
 */
export async function cubeLiquidity(): Promise<Liquidity> {
  const rows = await getDb()
    .select({
      account: sql<string>`coalesce(${accountBalance.name}, '—')`,
      kind: sql<string>`coalesce(${accountBalance.kind}, '—')`,
      balance: sql<string>`round(${accountBalance.balance}::numeric, 2)::text`,
      isLiability: accountBalance.isLiability,
      asOf: sql<string | null>`${accountBalance.asOfDate}::text`,
    })
    .from(accountBalance);

  const cashRows = rows.filter((r) => !r.isLiability);
  const cardRows = rows.filter((r) => r.isLiability && r.kind === "credit-card");
  const marginRows = rows.filter((r) => r.isLiability && r.kind !== "credit-card");

  const cash = sumMoney(cashRows.map((r) => r.balance));
  const cards = magnitude(sumMoney(cardRows.map((r) => r.balance)));
  const margin = magnitude(sumMoney(marginRows.map((r) => r.balance)));
  const revolvingDebt = addMoney(cards, margin);
  const net = subMoney(cash, revolvingDebt);

  const debts: LiquidityDebt[] = [...cardRows, ...marginRows]
    .map((r) => ({ account: r.account, kind: r.kind, amount: magnitude(r.balance) }))
    .sort((a, b) => Number(b.amount) - Number(a.amount));

  const asOf = rows.reduce<string | null>(
    (max, r) => (r.asOf && (!max || r.asOf > max) ? r.asOf : max),
    null,
  );

  return { asOf, cash, cards, margin, revolvingDebt, net, debts };
}

export interface EquityPoint {
  date: string;
  daily: string;
  cum: number;
}

/** Cumulative realized-P&L curve over time (by close date) — the waterfall/equity curve. */
export async function cubeEquityCurve(filter: CubeFilter = {}): Promise<EquityPoint[]> {
  const rows = await getDb()
    .select({
      date: sql<string>`coalesce(${cubeTrades.closedAt}, ${cubeTrades.openedAt})::date::text`,
      daily: sql<string>`round(sum(${cubeTrades.realizedPnl})::numeric,2)::text`,
    })
    .from(cubeTrades)
    .where(whereClause(filter))
    .groupBy(sql`coalesce(${cubeTrades.closedAt}, ${cubeTrades.openedAt})::date`)
    .orderBy(sql`coalesce(${cubeTrades.closedAt}, ${cubeTrades.openedAt})::date`);
  let cum = 0;
  return rows.map((r) => {
    cum += Number(r.daily);
    return { date: r.date, daily: r.daily, cum: Math.round(cum) };
  });
}
