import { desc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { addMoney } from "@/lib/money";

export interface AccountBalance {
  accountId: string;
  /** The anchor date used, or null if the account has no balance-forward. */
  asOfDate: string | null;
  /** The balance-forward amount (or "0.0000" if none). */
  forward: string;
  /** Σ of source transactions strictly after `asOfDate` (all, if no anchor). */
  since: string;
  /** forward + since. */
  balance: string;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) {
    throw new Error(`Unsafe SQL identifier: "${name}"`);
  }
  return name;
}

/**
 * Current balance for an account = latest BalanceForward + Σ of the account's
 * source transactions strictly after that anchor date. The sum runs over the
 * account's mapped source view (RO) using its `column_mapping`; the addition is
 * decimal-safe (no floats). Lineage intact: nothing is copied.
 */
export async function accountBalance(
  accountId: string,
): Promise<AccountBalance> {
  const db = getDb();

  const [acct] = await db
    .select()
    .from(schema.account)
    .where(eq(schema.account.id, accountId))
    .limit(1);
  if (!acct) throw new Error(`Unknown account: ${accountId}`);

  const [fwd] = await db
    .select()
    .from(schema.balanceForward)
    .where(eq(schema.balanceForward.accountId, accountId))
    .orderBy(desc(schema.balanceForward.asOfDate))
    .limit(1);

  const forward = fwd?.amount ?? "0.0000";
  const asOfDate = fwd?.asOfDate ?? null;

  const sourceSchema = ident(acct.sourceSchema);
  const sourceView = ident(acct.sourceView);
  const amountCol = ident(acct.columnMapping.amount);
  const dateCol = ident(acct.columnMapping.transactionDate);

  const from = sql.raw(`"${sourceSchema}"."${sourceView}"`);
  const amountRef = sql.raw(`"${amountCol}"`);
  const dateRef = sql.raw(`"${dateCol}"`);

  const rows = await db.execute<{ total: string }>(
    asOfDate
      ? sql`select coalesce(sum(${amountRef}), 0)::text as total from ${from} where ${dateRef} > ${asOfDate}`
      : sql`select coalesce(sum(${amountRef}), 0)::text as total from ${from}`,
  );
  const since = rows[0]?.total ?? "0";

  return {
    accountId,
    asOfDate,
    forward,
    since,
    balance: addMoney(forward, since),
  };
}
