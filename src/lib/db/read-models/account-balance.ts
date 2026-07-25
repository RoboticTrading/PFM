import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { accountBalance } from "@/lib/db/schema/account-balance";

/**
 * Read-model over the owner-editable `financialmanager.account_balance` table —
 * the writable replacement for the retired-from-these-readers `cube.account_snapshot`.
 *
 * The balance readers (`cubeNetWorth`, `cubeLiquidity`, the ledger account enrichers)
 * source their point-in-time balances from HERE. The projected shape is intentionally
 * identical to the old `cube.account_snapshot` select — `{ accountKey, account, kind,
 * balance, asOf, isLiability }` — so every downstream output stays byte-for-byte the
 * same; `balance` is rounded to 2dp text exactly as the old column read out.
 */

// Re-export the writable table so readers/writers share one binding.
export { accountBalance };

/** The old `cube.account_snapshot` row shape, now sourced from the writable table. */
export interface AccountBalanceSnapshot {
  accountKey: string;
  account: string | null;
  kind: string | null;
  balance: string;
  asOf: string | null;
  isLiability: boolean;
}

/** Every owner-editable balance, projected into the legacy snapshot shape. */
export async function listAccountBalanceSnapshots(): Promise<
  AccountBalanceSnapshot[]
> {
  return getDb()
    .select({
      accountKey: accountBalance.accountKey,
      account: accountBalance.name,
      kind: accountBalance.kind,
      balance: sql<string>`round(${accountBalance.balance}::numeric, 2)::text`,
      asOf: sql<string | null>`${accountBalance.asOfDate}::text`,
      isLiability: accountBalance.isLiability,
    })
    .from(accountBalance);
}
