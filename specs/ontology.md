# Ontology (PFM data model)

Model the *money*, not tables. Drizzle is the source of truth for the **`financialmanager`** schema;
the existing schemas are **read-only read-models**. Build to match; refine fields in-task, keep the shape.

## Conventions
- **Objects** = tables in `financialmanager` (UUID or serial PKs; `created_at`/`updated_at` on mutables).
- **Actions** = the ONLY way to mutate state — typed tRPC mutations that validate (zod) → authorize →
  write → write an `AuditLog` row. A shared `defineAction()` enforces it.
- **Functions** = pure read/derive.
- **Lineage is the law:** categorization and links **reference `source_txn_id`** — they NEVER copy the
  source row. Every number traces back to its source transaction.
- **Read-only boundary:** PFM reads `schwab_*`, `*_credit_card`, `trade_analysis` via typed
  read-models; it must never write them.

## `financialmanager` objects (PFM owns; rebuilt fresh — old schema is trash)
- **Institution** — `id`, `name`, `kind` (brokerage / bank / credit-card).
- **Account** — config-driven registry: `id`, `institution_id`, `name`, `kind`, `source_schema`,
  `source_view`, `column_mapping` (jsonb: how the source view's columns map to the canonical txn
  shape), `active`. Initial: Schwab Brokerage (trade + non-trade), Schwab Checking; 4 credit cards fast-follow.
- **BalanceForward** — `account_id`, `as_of_date`, `amount` (manually entered; current balance =
  balanceForward + Σ transactions since).
- **Category** — `id`, `parent_id`, `name`, `kind` (Income / Expense / Transfer). ~12 seed categories.
- **TransactionCategory** — the link table: `source_schema`, `source_txn_id`, `category_id`, `amount`
  (supports splits), `note`. **References the source txn; never copies it.**
- **Payee** — `id`, `name`, `normalized` (optional, for grouping/rules later).
- **Budget** — `category_id`, `period`, `amount`.
- **Position** + **PositionLeg** — manual positions paired from fills (instrument class + trade
  structure type/subtype). The MVP's `manual_positions` / `manual_position_legs`, rebuilt here.
- **PositionLink** — links a `Position` to `trade_analysis.position_history`.
- **ImportBatch** — provenance of an import run.
- **AuditLog** — `actor`, `action`, `target`, `payload` (redacted), `at`. Every Action writes one.

## Read-models (typed, READ-ONLY over existing schemas)
- `schwab_brokerage` → `v_trade_transactions` + `v_nontrade_transactions` (split).
- `schwab_checking`, the four `*_credit_card` schemas → each has a `v_transactions` (identical shape:
  `transaction_id`, `transaction_date`, `description`, `amount`).
- `trade_analysis.position_history` → for position linking.
- In **dev**, back these with **fixtures** mirroring the real shapes (the gate never hits live MyDB).

## Actions
`categorize`, `splitTransaction`, `recordTransfer`, `setBalanceForward`, `setBudget`,
`importTransactions`, `pairFillsIntoPosition`, `linkPosition`, `reconcile`.

## Functions
`accountBalance(account)` = balanceForward + Σ since · `netWorth` · `cashFlow(range)` ·
`budgetVsActual(period)` · `categoryReport(range)` · `unmatchedPositions` · `openPositions`.

## Notes
- Manual categorization first; rule-based / AI auto-suggest is a later, opt-in layer (Phase 9).
- Type/Subtype taxonomy (instrument class + trade structure) carries over for positions.
