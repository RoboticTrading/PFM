import { ledgerAccountBalance, type LedgerBalance } from "@/lib/db/read-models";

/** Current balance for an account (kept in the legacy forward/since/balance shape). */
export type AccountBalance = LedgerBalance;

/**
 * Current balance for an account, sourced from `cube.account_snapshot` (the
 * authoritative, seeded current balance). `accountKey` is `cube.account.account_key`.
 * The `{ forward, since, balance }` shape is preserved so the balance UI renders
 * unchanged: `forward` = the snapshot balance, `since` = 0.
 */
export async function accountBalance(
  accountKey: string,
): Promise<AccountBalance> {
  return ledgerAccountBalance(accountKey);
}
