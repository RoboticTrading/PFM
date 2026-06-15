import type { AccountKind, ColumnMapping } from "@/lib/db/schema/account";
import type { InstitutionKind } from "@/lib/db/schema/institution";

/**
 * The config-driven account registry. Adding an account = adding an entry here
 * (source schema + view + column mapping); no code changes. `seedAccounts`
 * syncs these into `financialmanager` idempotently. The `pfm` role is RO on
 * every `sourceSchema` referenced.
 */

export interface InstitutionSpec {
  name: string;
  kind: InstitutionKind;
}

export interface AccountSpec {
  name: string;
  kind: AccountKind;
  /** Institution `name` (key into {@link INSTITUTIONS}). */
  institution: string;
  sourceSchema: string;
  sourceView: string;
  columnMapping: ColumnMapping;
}

export const INSTITUTIONS: readonly InstitutionSpec[] = [
  { name: "Charles Schwab — Brokerage", kind: "brokerage" },
  { name: "Charles Schwab — Bank", kind: "bank" },
  { name: "Chase (Amazon)", kind: "credit-card" },
  { name: "American Express", kind: "credit-card" },
  { name: "Bank of America", kind: "credit-card" },
  { name: "Citi (Costco)", kind: "credit-card" },
] as const;

/** The canonical bank/card column mapping (shared v_transactions shape). */
const BANK_MAPPING: ColumnMapping = {
  transactionId: "transaction_id",
  transactionDate: "transaction_date",
  description: "description",
  amount: "amount",
};

export const ACCOUNTS: readonly AccountSpec[] = [
  {
    name: "Schwab Brokerage — Trades",
    kind: "brokerage",
    institution: "Charles Schwab — Brokerage",
    sourceSchema: "schwab_brokerage",
    sourceView: "v_trade_transactions",
    columnMapping: {
      transactionId: "activity_id",
      transactionDate: "trade_date",
      description: "description",
      amount: "net_amount",
      extras: { symbol: "symbol", price: "price" },
    },
  },
  {
    name: "Schwab Brokerage — Activity",
    kind: "brokerage",
    institution: "Charles Schwab — Brokerage",
    sourceSchema: "schwab_brokerage",
    sourceView: "v_nontrade_transactions",
    columnMapping: {
      transactionId: "activity_id",
      transactionDate: "trade_date",
      description: "description",
      amount: "net_amount",
    },
  },
  {
    name: "Schwab Checking",
    kind: "checking",
    institution: "Charles Schwab — Bank",
    sourceSchema: "schwab_checking",
    sourceView: "v_transactions",
    columnMapping: BANK_MAPPING,
  },
  {
    name: "Amazon (Chase) Card",
    kind: "credit-card",
    institution: "Chase (Amazon)",
    sourceSchema: "amazon_chase_credit_card",
    sourceView: "v_transactions",
    columnMapping: BANK_MAPPING,
  },
  {
    name: "American Express Card",
    kind: "credit-card",
    institution: "American Express",
    sourceSchema: "american_express_credit_card",
    sourceView: "v_transactions",
    columnMapping: BANK_MAPPING,
  },
  {
    name: "Bank of America Card",
    kind: "credit-card",
    institution: "Bank of America",
    sourceSchema: "bank_of_america_credit_card",
    sourceView: "v_transactions",
    columnMapping: BANK_MAPPING,
  },
  {
    name: "Costco (Citi) Card",
    kind: "credit-card",
    institution: "Citi (Costco)",
    sourceSchema: "costco_citi_credit_card",
    sourceView: "v_transactions",
    columnMapping: BANK_MAPPING,
  },
] as const;
