import { type CanonicalTxn, listLedgerTransactions } from "@/lib/db/read-models";

import { ALL_ACCOUNTS } from "./register-types";

/**
 * Canonical transactions for an account (newest first), read from the unified
 * `cube.v_ledger`. The `accountKey` is `cube.account.account_key`; pass the
 * {@link ALL_ACCOUNTS} sentinel to stream every account unified. Nothing is
 * copied — this is a read over the RO ledger; lineage stays (source_schema,
 * source_txn_id).
 */
export async function accountTransactions(
  accountKey: string,
  opts: { limit?: number } = {},
): Promise<CanonicalTxn[]> {
  const key = accountKey === ALL_ACCOUNTS ? undefined : accountKey;
  return listLedgerTransactions(key, opts);
}
