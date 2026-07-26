import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { cubeVLedger } from "@/lib/db/read-models/cube";
import { toCanonicalLedger, type CanonicalTxn } from "@/lib/db/read-models";

import { accountTransactions } from "./transactions";
import { ALL_ACCOUNTS, SPLIT_CATEGORY, type RegisterTxn } from "./register-types";

export { SPLIT_CATEGORY, ALL_ACCOUNTS, type RegisterTxn } from "./register-types";

const { transactionCategory, category } = schema;

// --- Category enrichment (lineage-preserving) -----------------------------

/**
 * Enrich canonical transactions with their categorization. Lineage intact —
 * categorizations are matched by the composite key (`source_schema`,
 * `source_txn_id`), never copied. One account can span several source schemas
 * (brokerage = trade + non-trade; the unified ledger = all of them), so the join
 * keys on the pair, not the id alone. Multiple links on one txn → the split
 * sentinel; one → that category; none → uncategorized (`categoryId: null`).
 */
async function enrichWithCategories(
  txns: CanonicalTxn[],
): Promise<RegisterTxn[]> {
  if (txns.length === 0) return [];

  const schemas = [...new Set(txns.map((t) => t.sourceSchema))];
  const ids = [...new Set(txns.map((t) => t.sourceTxnId))];

  const links = await getDb()
    .select({
      sourceSchema: transactionCategory.sourceSchema,
      sourceTxnId: transactionCategory.sourceTxnId,
      categoryId: transactionCategory.categoryId,
      categoryName: category.name,
    })
    .from(transactionCategory)
    .innerJoin(category, eq(transactionCategory.categoryId, category.id))
    .where(
      and(
        inArray(transactionCategory.sourceSchema, schemas),
        inArray(transactionCategory.sourceTxnId, ids),
      ),
    );

  const keyOf = (sourceSchema: string, sourceTxnId: string) =>
    `${sourceSchema}:${sourceTxnId}`;

  const byTxn = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const k = keyOf(l.sourceSchema, l.sourceTxnId);
    const list = byTxn.get(k) ?? [];
    list.push({ id: l.categoryId, name: l.categoryName });
    byTxn.set(k, list);
  }

  return txns.map((t) => {
    const cats = byTxn.get(keyOf(t.sourceSchema, t.sourceTxnId));
    if (!cats || cats.length === 0) {
      return { ...t, categoryId: null, categoryName: null };
    }
    if (cats.length === 1) {
      return { ...t, categoryId: cats[0].id, categoryName: cats[0].name };
    }
    return { ...t, categoryId: SPLIT_CATEGORY, categoryName: "Split" };
  });
}

/**
 * An account's canonical ledger transactions joined with their categorization
 * (newest first, capped by `opts.limit`). Read-only; lineage by (source_schema,
 * source_txn_id). Prefer {@link registerPage} for filtered, full-history paging.
 */
export async function accountRegister(
  accountKey: string,
  opts: { limit?: number } = {},
): Promise<RegisterTxn[]> {
  const txns = await accountTransactions(accountKey, opts);
  return enrichWithCategories(txns);
}

// --- Server-side filtered + paginated register ----------------------------

/** Direction facet: inflows (amount > 0), outflows (< 0), or all. */
export type RegisterDirection = "all" | "in" | "out";

/**
 * A filter/paging request over the unified ledger. `category` mirrors the UI
 * facet: `"all"`, `"categorized"` (any link), `"uncategorized"` (no link), the
 * {@link SPLIT_CATEGORY} sentinel (>1 link), or a concrete category id (uuid).
 * All filters run in SQL so paging + counts span the FULL history, not a window.
 */
export interface RegisterQuery {
  /** Cube `account_key`; omit for all accounts unified. */
  accountKey?: string;
  category?: string;
  /** Case-insensitive substring over description. */
  query?: string;
  direction?: RegisterDirection;
  /** Inclusive ISO date lower bound (YYYY-MM-DD). */
  from?: string;
  /** Inclusive ISO date upper bound (YYYY-MM-DD). */
  to?: string;
  limit?: number;
  offset?: number;
}

/** A page of the register plus full-history counts (for paging + burn-down). */
export interface RegisterPage {
  rows: RegisterTxn[];
  /** Rows matching ALL filters (drives pagination + "showing X of N"). */
  total: number;
  /**
   * Uncategorized rows matching the NON-category filters (account / search /
   * direction / date). This is the burn-down target — the header "M
   * uncategorized" reflects the full matching history, not the loaded page.
   */
  uncategorized: number;
}

const DEFAULT_PAGE = 200;
const MAX_PAGE = 500;

/**
 * The correlated key match between a `cube.v_ledger` row and its
 * `financialmanager.transaction_category` links. Cross-schema, but a pure read.
 */
const linkMatches: SQL = sql`${transactionCategory.sourceSchema} = ${cubeVLedger.sourceSchema} and ${transactionCategory.sourceTxnId} = ${cubeVLedger.sourceTxnId}`;

const hasNoCategory: SQL = sql`not exists (select 1 from ${transactionCategory} where ${linkMatches})`;

/** Non-category WHERE conditions shared by the page + both count queries. */
function baseConditions(q: RegisterQuery): SQL[] {
  const conds: SQL[] = [];
  if (q.accountKey) conds.push(eq(cubeVLedger.accountKey, q.accountKey));

  // Trade legs (options/futures/equity fills) are NOT categorizable — a leg is half a round-trip,
  // not income/expense. The matched positions already roll up as Income/Trading in cube.structures,
  // so drop the raw trade-view rows from the categorization register (dividends/fees/transfers stay).
  conds.push(sql`${cubeVLedger.sourceSchema} NOT LIKE '%v_trade_transactions'`);
  // The covered-call ETF sleeve dividends ("GLOBAL X …") are already income in cube.holdings_income
  // (the sleeve). Exclude them here so they aren't double-counted when categorized.
  conds.push(sql`${cubeVLedger.description} NOT ILIKE 'GLOBAL X%'`);

  const text = q.query?.trim();
  if (text) {
    // Escape LIKE metacharacters so search stays a literal substring match.
    const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
    conds.push(ilike(cubeVLedger.description, `%${escaped}%`));
  }

  if (q.direction === "in") conds.push(gt(cubeVLedger.amount, "0"));
  else if (q.direction === "out") conds.push(lt(cubeVLedger.amount, "0"));

  if (q.from) conds.push(gte(cubeVLedger.txnDate, q.from));
  if (q.to) conds.push(lte(cubeVLedger.txnDate, q.to));

  return conds;
}

/** The category-state condition, or undefined for "all". */
function categoryCondition(category?: string): SQL | undefined {
  if (!category || category === "all") return undefined;
  if (category === "uncategorized") return hasNoCategory;
  if (category === "categorized") {
    return sql`exists (select 1 from ${transactionCategory} where ${linkMatches})`;
  }
  if (category === SPLIT_CATEGORY) {
    return sql`(select count(*) from ${transactionCategory} where ${linkMatches}) > 1`;
  }
  // A concrete category id.
  return sql`exists (select 1 from ${transactionCategory} where ${linkMatches} and ${transactionCategory.categoryId} = ${category})`;
}

/**
 * A filtered, paginated page of the unified ledger register, enriched with
 * categorization. Every filter (categorized-state, account, description search,
 * amount sign, date range) runs SERVER-side against `cube.v_ledger` LEFT-joined
 * (via correlated EXISTS) to `financialmanager.transaction_category`, so the
 * caller can page through ALL matching history — not just the newest window.
 * Returns the page plus a full-history `total` (all filters) and `uncategorized`
 * count (non-category filters), so the header count reflects reality.
 */
export async function registerPage(q: RegisterQuery): Promise<RegisterPage> {
  const db = getDb();
  const base = baseConditions(q);
  const catCond = categoryCondition(q.category);
  const limit = Math.min(Math.max(q.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
  const offset = Math.max(q.offset ?? 0, 0);

  const [pageRows, totalRes, uncatRes] = await Promise.all([
    db
      .select()
      .from(cubeVLedger)
      .where(and(...base, catCond))
      .orderBy(desc(cubeVLedger.txnDate), desc(cubeVLedger.sourceTxnId))
      .limit(limit)
      .offset(offset),
    db
      .select({ value: count() })
      .from(cubeVLedger)
      .where(and(...base, catCond)),
    db
      .select({ value: count() })
      .from(cubeVLedger)
      .where(and(...base, hasNoCategory)),
  ]);

  const rows = await enrichWithCategories(pageRows.map(toCanonicalLedger));
  return {
    rows,
    total: totalRes[0]?.value ?? 0,
    uncategorized: uncatRes[0]?.value ?? 0,
  };
}

// --- Select-all-matching (whole-filter bulk categorize) -------------------

/**
 * Safety ceiling for one "select all matching" gather — far above any real
 * single-merchant filter, so an over-broad filter can't silently queue an
 * unbounded mass-assign. If the match count exceeds this, the caller is told
 * (`capped`) so it can ask the user to narrow the filter.
 */
const MAX_MATCHING = 5000;

/** A ledger row's write-ref — the lineage key + date + amount a categorize needs. */
export interface TxnRef {
  sourceSchema: string;
  sourceTxnId: string;
  txnDate: string;
  amount: string;
}

/** All write-refs matching a filter, plus the true `total` and whether the ceiling truncated it. */
export interface MatchingRefs {
  refs: TxnRef[];
  total: number;
  capped: boolean;
}

/**
 * Every write-ref matching a filter — powers "select all N matching this filter"
 * bulk categorization. Runs the SAME conditions as {@link registerPage} (so the
 * gathered set is exactly what the register shows), but returns ALL matches with
 * NO pagination — just the lineage keys the bulk categorize needs — up to
 * {@link MAX_MATCHING}. This is the escape hatch from per-page selection: the
 * filter itself is the scope, so applying to the whole set is safe and explicit.
 */
export async function matchingRefs(q: RegisterQuery): Promise<MatchingRefs> {
  const db = getDb();
  const base = baseConditions(q);
  const catCond = categoryCondition(q.category);

  const [refRows, totalRes] = await Promise.all([
    db
      .select({
        sourceSchema: cubeVLedger.sourceSchema,
        sourceTxnId: cubeVLedger.sourceTxnId,
        txnDate: cubeVLedger.txnDate,
        amount: cubeVLedger.amount,
      })
      .from(cubeVLedger)
      .where(and(...base, catCond))
      .orderBy(desc(cubeVLedger.txnDate), desc(cubeVLedger.sourceTxnId))
      .limit(MAX_MATCHING),
    db.select({ value: count() }).from(cubeVLedger).where(and(...base, catCond)),
  ]);

  const total = totalRes[0]?.value ?? 0;
  return {
    refs: refRows.map((r) => ({
      sourceSchema: r.sourceSchema ?? "",
      sourceTxnId: String(r.sourceTxnId ?? ""),
      txnDate: (r.txnDate ?? "").slice(0, 10),
      amount: r.amount ?? "0",
    })),
    total,
    capped: total > MAX_MATCHING,
  };
}
