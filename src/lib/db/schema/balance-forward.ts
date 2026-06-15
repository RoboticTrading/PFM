import { date, unique, uuid } from "drizzle-orm/pg-core";

import { account } from "./account";
import { financialmanager } from "./_schema";
import { money, timestamps } from "./columns";

/**
 * BalanceForward — a manually-entered known balance for an account as of a date.
 * `accountBalance` = latest balanceForward + Σ source transactions since. One
 * anchor per account per date.
 */
export const balanceForward = financialmanager.table(
  "balance_forward",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id),
    asOfDate: date("as_of_date").notNull(),
    amount: money("amount").notNull(),
    ...timestamps,
  },
  (t) => [unique("balance_forward_account_date").on(t.accountId, t.asOfDate)],
);

export type BalanceForward = typeof balanceForward.$inferSelect;
export type NewBalanceForward = typeof balanceForward.$inferInsert;
