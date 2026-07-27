import { and, asc, eq, gte, isNotNull, lte, ne, sql } from "drizzle-orm";

import { cubeNetWorth, type NetWorth as BalanceSheet } from "@/lib/cube/cube";
import { getDb, schema } from "@/lib/db";
import { cubeStructures } from "@/lib/db/read-models/cube";
import { listLedgerAccounts } from "@/lib/db/read-models";
import { addMoney, sumMoney, toScaled } from "@/lib/money";

import {
  buildPeriods,
  type Grain,
  type Period,
  periodIndexOf,
} from "./periods";

export interface DateRange {
  /** Inclusive ISO start (YYYY-MM-DD). */
  from: string;
  /** Inclusive ISO end (YYYY-MM-DD). */
  to: string;
}

export interface CategoryReportRow {
  categoryId: string;
  categoryName: string;
  kind: string;
  total: string;
}

/** Σ of categorized amounts per category over a date range (by txn_date). */
export async function categoryReport(
  range: DateRange,
): Promise<CategoryReportRow[]> {
  return getDb()
    .select({
      categoryId: schema.transactionCategory.categoryId,
      categoryName: schema.category.name,
      kind: schema.category.kind,
      total: sql<string>`sum(${schema.transactionCategory.amount})::text`,
    })
    .from(schema.transactionCategory)
    .innerJoin(
      schema.category,
      eq(schema.transactionCategory.categoryId, schema.category.id),
    )
    .where(
      and(
        gte(schema.transactionCategory.txnDate, range.from),
        lte(schema.transactionCategory.txnDate, range.to),
      ),
    )
    .groupBy(
      schema.transactionCategory.categoryId,
      schema.category.name,
      schema.category.kind,
    )
    .orderBy(asc(schema.category.name));
}

export interface CashFlow {
  range: DateRange;
  income: string;
  expense: string;
  transfer: string;
  /** income + expense + transfer (expenses are negative). */
  net: string;
}

/** Income vs expense (and transfers) over a range, from categorizations. */
export async function cashFlow(range: DateRange): Promise<CashFlow> {
  const rows = await getDb()
    .select({
      kind: schema.category.kind,
      total: sql<string>`sum(${schema.transactionCategory.amount})::text`,
    })
    .from(schema.transactionCategory)
    .innerJoin(
      schema.category,
      eq(schema.transactionCategory.categoryId, schema.category.id),
    )
    .where(
      and(
        gte(schema.transactionCategory.txnDate, range.from),
        lte(schema.transactionCategory.txnDate, range.to),
      ),
    )
    .groupBy(schema.category.kind);

  const byKind = new Map(rows.map((r) => [r.kind, r.total]));
  const income = byKind.get("Income") ?? "0";
  const expense = byKind.get("Expense") ?? "0";
  const transfer = byKind.get("Transfer") ?? "0";
  return {
    range,
    income: sumMoney([income]),
    expense: sumMoney([expense]),
    transfer: sumMoney([transfer]),
    net: sumMoney([income, expense, transfer]),
  };
}

export interface NetWorth {
  total: string;
  byAccount: { accountId: string; name: string; balance: string }[];
}

/** Σ of every active account's current balance, from `cube.account_snapshot`. */
export async function netWorth(): Promise<NetWorth> {
  const accounts = await listLedgerAccounts();
  const byAccount = accounts
    .filter((a) => a.active)
    .map((a) => ({ accountId: a.id, name: a.name, balance: a.balance }));

  return {
    total: sumMoney(byAccount.map((b) => b.balance)),
    byAccount,
  };
}

// ─── Windowed accounting reports (Week / Bi-Weekly / Month / Quarter) ─────────
//
// Income/Expense + Cashflow are period-bucketed views over the SAME truth set: the
// categorized ledger (`transaction_category`, Transfers excluded — they move money
// between Bob's own accounts and net to zero) PLUS realized trading P&L bridged in
// from `cube.structures` (trades aren't categorizable, but they ARE income). The
// two sources are disjoint by construction — trade legs are excluded from the
// categorization register — so summing them can't double-count.

interface FlowRow {
  /** ISO txn/close date the row buckets by. */
  date: string;
  /** Signed money string (+in / −out). */
  amount: string;
  kind: "Income" | "Expense";
  /** Display label — a category name, or "Trading · <asset class>". */
  label: string;
}

/** The unified flow set for a range: categorized non-transfer rows + trading P&L. */
async function flowRows(range: DateRange): Promise<FlowRow[]> {
  const db = getDb();
  const [categorized, trading] = await Promise.all([
    db
      .select({
        date: sql<string>`${schema.transactionCategory.txnDate}::text`,
        amount: sql<string>`${schema.transactionCategory.amount}::text`,
        kind: schema.category.kind,
        label: schema.category.name,
      })
      .from(schema.transactionCategory)
      .innerJoin(
        schema.category,
        eq(schema.transactionCategory.categoryId, schema.category.id),
      )
      .where(
        and(
          gte(schema.transactionCategory.txnDate, range.from),
          lte(schema.transactionCategory.txnDate, range.to),
          ne(schema.category.kind, "Transfer"),
        ),
      ),
    db
      .select({
        // Realized date = when it closed, or (for a worthless expiry, closed_at IS NULL) its
        // open/expiry day. Expiry winners keep the full credit; without this coalesce they'd fall
        // out of every date-windowed report.
        date: sql<string>`coalesce(${cubeStructures.closedAt}, ${cubeStructures.openedAt})::date::text`,
        amount: sql<string>`${cubeStructures.realizedPnl}::text`,
        path: sql<string>`coalesce(${cubeStructures.category}, 'Income / Trading / Other')`,
      })
      .from(cubeStructures)
      .where(
        and(
          isNotNull(cubeStructures.realizedPnl),
          sql`coalesce(${cubeStructures.closedAt}, ${cubeStructures.openedAt})::date >= ${range.from}`,
          sql`coalesce(${cubeStructures.closedAt}, ${cubeStructures.openedAt})::date <= ${range.to}`,
        ),
      ),
  ]);

  const catRows: FlowRow[] = categorized.map((r) => ({
    date: r.date,
    amount: r.amount,
    kind: (r.kind === "Expense" ? "Expense" : "Income") as FlowRow["kind"],
    label: r.label,
  }));
  const tradeRows: FlowRow[] = trading.map((r) => ({
    date: r.date,
    amount: r.amount,
    kind: "Income",
    label: `Trading · ${r.path.split("/").pop()?.trim() || "Other"}`,
  }));
  return [...catRows, ...tradeRows];
}

/** |a| vs |b| descending — order breakdown rows by magnitude, biggest first. */
function byMagnitudeDesc(a: { total: string }, b: { total: string }): number {
  const av = toScaled(a.total);
  const bv = toScaled(b.total);
  const aa = av < 0n ? -av : av;
  const bb = bv < 0n ? -bv : bv;
  return aa > bb ? -1 : aa < bb ? 1 : 0;
}

/** One statement line — a category (or subtotal) with its per-period cells + row sum. */
export interface MatrixRow {
  label: string;
  /** Amount in each period, aligned index-for-index to `periods`. */
  byPeriod: string[];
  /** Row sum across every period. */
  total: string;
}

export interface IncomeStatement {
  range: DateRange;
  grain: Grain;
  /** The column headers — one per period, left→right. */
  periods: { key: string; label: string }[];
  /** Income line items (rows), biggest first — incl. bridged Trading. */
  income: MatrixRow[];
  /** Expense line items (rows), biggest magnitude first. */
  expense: MatrixRow[];
  /** Section subtotal + net rows (each a full per-period vector + total). */
  incomeTotal: MatrixRow;
  expenseTotal: MatrixRow;
  net: MatrixRow;
}

/**
 * The Income/Expense (P&L) statement in the TRADITIONAL shape: line items down
 * the rows, periods across the columns, a row sum, and section-subtotal + net
 * rows — a pivot, not a transposed series. Trading realized P&L is folded into
 * Income (labeled "Trading · <asset class>"); Transfers are excluded.
 */
export async function incomeStatement(
  range: DateRange,
  grain: Grain,
): Promise<IncomeStatement> {
  const rows = await flowRows(range);
  const periods = buildPeriods(range, grain);
  const nP = periods.length;

  // label → per-period buckets of amounts (the matrix cells)
  const incCells = new Map<string, string[][]>();
  const expCells = new Map<string, string[][]>();
  const freshCells = () => Array.from({ length: nP }, () => [] as string[]);

  for (const r of rows) {
    const i = periodIndexOf(periods, r.date);
    if (i < 0) continue;
    const m = r.kind === "Income" ? incCells : expCells;
    let cells = m.get(r.label);
    if (!cells) {
      cells = freshCells();
      m.set(r.label, cells);
    }
    cells[i].push(r.amount);
  }

  const toRow = (label: string, cells: string[][]): MatrixRow => {
    const byPeriod = cells.map((c) => sumMoney(c));
    return { label, byPeriod, total: sumMoney(byPeriod) };
  };
  const income = [...incCells.entries()]
    .map(([l, c]) => toRow(l, c))
    .sort(byMagnitudeDesc);
  const expense = [...expCells.entries()]
    .map(([l, c]) => toRow(l, c))
    .sort(byMagnitudeDesc);

  // A column-wise subtotal across a set of rows (per-period + grand total).
  const subtotal = (label: string, set: MatrixRow[]): MatrixRow => ({
    label,
    byPeriod: periods.map((_, i) => sumMoney(set.map((r) => r.byPeriod[i]))),
    total: sumMoney(set.map((r) => r.total)),
  });
  const incomeTotal = subtotal("Total income", income);
  const expenseTotal = subtotal("Total expenses", expense);
  const net: MatrixRow = {
    label: "Net",
    byPeriod: periods.map((_, i) =>
      addMoney(incomeTotal.byPeriod[i], expenseTotal.byPeriod[i]),
    ),
    total: addMoney(incomeTotal.total, expenseTotal.total),
  };

  return {
    range,
    grain,
    periods: periods.map((p) => ({ key: p.key, label: p.label })),
    income,
    expense,
    incomeTotal,
    expenseTotal,
    net,
  };
}

export interface CashFlowPeriod {
  key: string;
  label: string;
  inflow: string;
  outflow: string;
  net: string;
  /** Cumulative net across the series (period-end running balance of flow). */
  running: string;
}

export interface CashFlowSeries {
  range: DateRange;
  grain: Grain;
  series: CashFlowPeriod[];
  totals: { inflow: string; outflow: string; net: string };
}

/**
 * The Cashflow report: money in vs money out, period by period, with a running
 * cumulative net. Same truth set as the income statement (categorized
 * non-transfers + trading P&L); inflow = Σ positive, outflow = Σ negative.
 */
export async function cashFlowSeries(
  range: DateRange,
  grain: Grain,
): Promise<CashFlowSeries> {
  const rows = await flowRows(range);
  const periods = buildPeriods(range, grain);

  const inByP: string[][] = periods.map(() => []);
  const outByP: string[][] = periods.map(() => []);
  for (const r of rows) {
    const i = periodIndexOf(periods, r.date);
    if (i < 0) continue;
    (r.amount.startsWith("-") ? outByP : inByP)[i].push(r.amount);
  }

  let running = "0";
  const series: CashFlowPeriod[] = periods.map((p, i) => {
    const inflow = sumMoney(inByP[i]);
    const outflow = sumMoney(outByP[i]);
    const net = addMoney(inflow, outflow);
    running = addMoney(running, net);
    return { key: p.key, label: p.label, inflow, outflow, net, running };
  });

  const inflow = sumMoney(series.map((s) => s.inflow));
  const outflow = sumMoney(series.map((s) => s.outflow));
  return {
    range,
    grain,
    series,
    totals: { inflow, outflow, net: addMoney(inflow, outflow) },
  };
}

/**
 * The Balance Sheet — point-in-time assets vs liabilities. A stock, not a flow:
 * it reflects TODAY's marked positions + owner-editable balances, so it's a
 * current snapshot regardless of the report window (we don't retain historical
 * per-day balances yet). Delegates to the authoritative {@link cubeNetWorth}.
 */
export async function balanceSheet(): Promise<BalanceSheet> {
  return cubeNetWorth();
}
