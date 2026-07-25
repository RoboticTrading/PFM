import { boolean, date, text, unique, uuid } from "drizzle-orm/pg-core";

import { financialmanager } from "./_schema";
import { money, timestamps } from "./columns";

/**
 * AccountBalance — the owner-editable, point-in-time balance per account (checking,
 * brokerage margin, credit cards). This is the WRITABLE home for the balances that
 * used to live (read-only) in `cube.account_snapshot`: the `pfm` role can UPDATE
 * these, so the app's balance editor can set them. Keyed by the stable
 * `account_key` (`cube.account.account_key`) so the readers join exactly as before.
 * Positive = asset, negative = owed; `is_liability` makes the sign explicit for the
 * net-worth roll-up.
 */
export const accountBalance = financialmanager.table(
  "account_balance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable join key — `cube.account.account_key`. Natural key for upserts. */
    accountKey: text("account_key").notNull(),
    /** Display label (mirrors the old snapshot's `account`). */
    name: text("name"),
    kind: text("kind"), // checking | brokerage | credit-card
    balance: money("balance").notNull(),
    asOfDate: date("as_of_date").notNull(),
    isLiability: boolean("is_liability").notNull().default(false),
    ...timestamps,
  },
  (t) => [unique("account_balance_account_key").on(t.accountKey)],
);

export type AccountBalance = typeof accountBalance.$inferSelect;
export type NewAccountBalance = typeof accountBalance.$inferInsert;
