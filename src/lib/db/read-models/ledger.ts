import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "../index";
import {
  cubeAccount,
  cubeAccountSnapshot,
  cubeVLedger,
} from "./cube";
import type { CanonicalTxn } from "./transactions";

/**
 * Read-models over the unified Cube ledger (`cube.v_ledger` + `cube.account`).
 *
 * PFM's transaction + account read paths source from HERE — a single, all-account
 * ledger — instead of the scattered per-source `v_*` views. Everything projects into
 * the SAME {@link CanonicalTxn} shape so categorization + lineage (by `source_schema`,
 * `source_txn_id`) and every downstream report keep working unchanged. READ-ONLY:
 * `cube.*` is RO to the `pfm` role (DB-enforced).
 */

type LedgerRow = typeof cubeVLedger.$inferSelect;

interface ListOpts {
  limit?: number;
}

const DEFAULT_LIMIT = 100;

// --- Pure projection (unit-testable without a DB) -------------------------

/**
 * Project a `cube.v_ledger` row into the canonical shape. `sourceSchema` +
 * `sourceTxnId` pass through verbatim — they ARE the lineage key categorizations
 * reference, so existing (and future) category links match with zero remapping.
 */
export function toCanonicalLedger(r: LedgerRow): CanonicalTxn {
  return {
    sourceSchema: r.sourceSchema ?? "",
    sourceView: "v_ledger",
    sourceTxnId: String(r.sourceTxnId ?? ""),
    date: r.txnDate ?? "",
    description: r.description ?? "",
    amount: r.amount ?? "0",
    symbol: r.symbol ?? undefined,
  };
}

// --- Transactions ---------------------------------------------------------

/**
 * Unified ledger transactions, newest first (canonical shape). Pass an
 * `accountKey` to scope to one account; omit it to stream ALL accounts unified.
 */
export async function listLedgerTransactions(
  accountKey?: string,
  opts: ListOpts = {},
): Promise<CanonicalTxn[]> {
  const rows = await getDb()
    .select()
    .from(cubeVLedger)
    .where(accountKey ? eq(cubeVLedger.accountKey, accountKey) : undefined)
    .orderBy(desc(cubeVLedger.txnDate), desc(cubeVLedger.sourceTxnId))
    .limit(opts.limit ?? DEFAULT_LIMIT);

  return rows.map(toCanonicalLedger);
}

// --- Accounts -------------------------------------------------------------

/**
 * Institution enrichment by `account_key`. `cube.account` carries no institution
 * (it's a lean registry), so PFM supplies the display label + kind here — the same
 * facts the old `financialmanager.institution` registry held, now decoupled.
 */
const INSTITUTION_BY_KEY: Record<
  string,
  { institutionName: string; institutionKind: string }
> = {
  schwab_brokerage: {
    institutionName: "Charles Schwab — Brokerage",
    institutionKind: "brokerage",
  },
  schwab_checking: {
    institutionName: "Charles Schwab — Bank",
    institutionKind: "bank",
  },
  amazon_chase_card: {
    institutionName: "Chase (Amazon)",
    institutionKind: "credit-card",
  },
  amex_card: {
    institutionName: "American Express",
    institutionKind: "credit-card",
  },
  bofa_card: {
    institutionName: "Bank of America",
    institutionKind: "credit-card",
  },
  costco_citi_card: {
    institutionName: "Citi (Costco)",
    institutionKind: "credit-card",
  },
};

const UNKNOWN_INSTITUTION = {
  institutionName: "—",
  institutionKind: "bank",
};

/** A cube account enriched with institution + its current snapshot balance. */
export interface LedgerAccount {
  /** The account's stable identity — `cube.account.account_key`. */
  id: string;
  name: string;
  kind: string;
  active: boolean;
  institutionName: string;
  institutionKind: string;
  /** Human-readable source label (the cube account key). */
  sourceLabel: string;
  /** Current balance from `cube.account_snapshot` (signed), or "0.0000". */
  balance: string;
  /** The snapshot's `as_of` date, or null if no snapshot. */
  asOfDate: string | null;
  /** True when this balance is money owed (credit-card / margin). */
  isLiability: boolean;
}

type SnapshotRow = typeof cubeAccountSnapshot.$inferSelect;

/**
 * Match a cube account to its snapshot on the stable `account_key` (normalized onto
 * `cube.account_snapshot`), with a kind/name fallback for any snapshot not yet keyed.
 */
function matchSnapshot(
  account: { accountKey: string; name: string; kind: string },
  snapshots: SnapshotRow[],
): SnapshotRow | null {
  const byKey = snapshots.find((s) => s.accountKey === account.accountKey);
  if (byKey) return byKey;
  const sameKind = snapshots.filter((s) => s.kind === account.kind);
  if (sameKind.length === 1) return sameKind[0];
  return sameKind.find((s) => s.account === account.name) ?? null;
}

function enrich(
  account: typeof cubeAccount.$inferSelect,
  snapshots: SnapshotRow[],
): LedgerAccount {
  const key = account.accountKey ?? "";
  const inst = INSTITUTION_BY_KEY[key] ?? UNKNOWN_INSTITUTION;
  const snap = matchSnapshot(
    { accountKey: key, name: account.name ?? "", kind: account.kind ?? "" },
    snapshots,
  );
  return {
    id: key,
    name: account.name ?? key,
    kind: account.kind ?? "",
    active: account.active ?? true,
    institutionName: inst.institutionName,
    institutionKind: inst.institutionKind,
    sourceLabel: key,
    balance: snap?.balance ?? "0.0000",
    asOfDate: snap?.asOf ?? null,
    isLiability: snap?.isLiability ?? false,
  };
}

/** Every cube account, enriched with institution + current snapshot balance. */
export async function listLedgerAccounts(): Promise<LedgerAccount[]> {
  const db = getDb();
  const [accounts, snapshots] = await Promise.all([
    db.select().from(cubeAccount).orderBy(asc(cubeAccount.name)),
    db.select().from(cubeAccountSnapshot),
  ]);
  return accounts.map((a) => enrich(a, snapshots));
}

/** A single cube account by its `account_key`, enriched, or null. */
export async function getLedgerAccount(
  accountKey: string,
): Promise<LedgerAccount | null> {
  const db = getDb();
  const [[account], snapshots] = await Promise.all([
    db.select().from(cubeAccount).where(eq(cubeAccount.accountKey, accountKey)).limit(1),
    db.select().from(cubeAccountSnapshot),
  ]);
  return account ? enrich(account, snapshots) : null;
}

/**
 * Current balance for an account, sourced from `cube.account_snapshot`. Kept in the
 * legacy `{ forward, since, balance }` shape so the balance UI renders unchanged —
 * the snapshot is the authoritative current balance (`forward`), with `since` = 0.
 */
export interface LedgerBalance {
  accountId: string;
  asOfDate: string | null;
  forward: string;
  since: string;
  balance: string;
}

export async function ledgerAccountBalance(
  accountKey: string,
): Promise<LedgerBalance> {
  const account = await getLedgerAccount(accountKey);
  const balance = account?.balance ?? "0.0000";
  return {
    accountId: accountKey,
    asOfDate: account?.asOfDate ?? null,
    forward: balance,
    since: "0.0000",
    balance,
  };
}
