import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import {
  type BankSourceSchema,
  BANK_SOURCES,
  type CanonicalTxn,
  listBankTransactions,
  listNontradeTransactions,
  listTradeTransactions,
} from "@/lib/db/read-models";

/**
 * Resolve an account to its source read-model and return canonical transactions
 * (newest first). The account's `sourceSchema`/`sourceView` pick the read-model;
 * nothing is copied — these are reads over the RO source views.
 */
export async function accountTransactions(
  accountId: string,
  opts: { limit?: number } = {},
): Promise<CanonicalTxn[]> {
  const [acct] = await getDb()
    .select({
      sourceSchema: schema.account.sourceSchema,
      sourceView: schema.account.sourceView,
    })
    .from(schema.account)
    .where(eq(schema.account.id, accountId))
    .limit(1);
  if (!acct) throw new Error(`Unknown account: ${accountId}`);

  if (acct.sourceSchema === "schwab_brokerage") {
    return acct.sourceView === "v_trade_transactions"
      ? listTradeTransactions(opts)
      : listNontradeTransactions(opts);
  }
  if (acct.sourceSchema in BANK_SOURCES) {
    return listBankTransactions(acct.sourceSchema as BankSourceSchema, opts);
  }
  throw new Error(
    `No read-model for ${acct.sourceSchema}.${acct.sourceView}`,
  );
}
