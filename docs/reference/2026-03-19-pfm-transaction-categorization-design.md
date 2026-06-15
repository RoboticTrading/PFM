# PFM Transaction Categorization — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**App:** `dashboard/pfm/` (Flask, port 8070, PIN auth)

## Problem

The PFM app currently handles only brokerage trade matching (Position Matching).
The remaining brokerage transactions (dividends, interest, journals, deposits,
withdrawals — 259 transactions) have no categorization workflow. Checking and
credit card accounts (5 schemas, ~1,418 transactions) are not wired at all.

The old `financialmanager` schema is abandoned cruft — drop and rebuild.

## Goals

1. Thermonuclear the `financialmanager` schema and recreate it clean
2. Add a left-nav SPA layout (Quicken-class) replacing the current tab bar
3. Wire Schwab Brokerage non-trade transactions for manual categorization
4. Wire Schwab Checking as the proof of the standard-shape pattern
5. Link matched positions to `trade_analysis.position_history`
6. Provide a Dashboard, Category tree editor, and Reports placeholder
7. Remaining 4 credit card schemas are a fast-follow after initial proof

## Non-Goals

- Rule-based auto-categorization (future iteration)
- Budgeting features (future)
- Multi-user support (single-user PIN auth is sufficient)
- Automated transaction import (data already lands in schemas via existing pipelines)

## Workflow

1. Transactions arrive in source schemas via existing import pipelines
2. User opens PFM app → Dashboard shows uncategorized transaction counts per account
3. User clicks an account in the left nav
4. **Brokerage account** shows two sub-tabs:
   - **Trade Matching** — existing Position Matching feature (unchanged)
   - **Non-Trade** — dividends, interest, journals, etc. for manual categorization
5. **Checking account** shows one view: all transactions for categorization
6. User assigns categories inline (click cell → dropdown) or bulk-selects → "Categorize"
7. After closing a position in Trade Matching, user can link it to `trade_analysis.position_history`
8. Dashboard and Reports reflect categorization progress

---

## Database Schema

### Drop & Recreate

```sql
DROP SCHEMA IF EXISTS financialmanager CASCADE;
CREATE SCHEMA financialmanager;
```

### `financialmanager.accounts`

Account registry — one row per source schema. Config-driven: adding a future
brokerage means adding a row and pointing at its views.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `name` | `TEXT NOT NULL` | Display name ("Schwab Brokerage") |
| `account_type` | `TEXT NOT NULL` | `'brokerage'`, `'checking'`, `'credit_card'` |
| `source_schema` | `TEXT NOT NULL` | PostgreSQL schema name |
| `trade_view` | `TEXT NULL` | View name for trade transactions (brokerage only) |
| `nontrade_view` | `TEXT NULL` | View name for non-trade transactions (brokerage only) |
| `txn_view` | `TEXT NULL` | View name for all transactions (checking/CC) |
| `id_column` | `TEXT NOT NULL` | PK column name in source view (`'activity_id'` or `'transaction_id'`) |
| `date_column` | `TEXT NOT NULL` | Date column name (`'trade_date'` or `'transaction_date'`) |
| `description_column` | `TEXT NOT NULL` | Description column name |
| `amount_column` | `TEXT NOT NULL` | Amount column name (`'net_amount'` or `'amount'`) |
| `is_active` | `BOOLEAN DEFAULT true` | Enabled in UI |
| `display_order` | `INT DEFAULT 0` | Left nav sort order |

**Seed data (2 accounts):**

| name | account_type | source_schema | trade_view | nontrade_view | txn_view | id_column | date_column | description_column | amount_column |
|---|---|---|---|---|---|---|---|---|---|
| Schwab Brokerage | brokerage | schwab_brokerage | v_trade_transactions | v_nontrade_transactions | — | activity_id | trade_date | description | net_amount |
| Schwab Checking | checking | schwab_checking | — | — | v_transactions | transaction_id | transaction_date | description | amount |

> **Note:** Source schema/view/column names from the `accounts` table are interpolated into
> SQL queries. Since accounts are admin-seeded (no create/update API), this is safe. If
> account management is ever exposed via API, add allowlist validation.

### `financialmanager.categories`

Three-root-type hierarchy: Income, Expense, Transfer.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `name` | `TEXT NOT NULL` | Category name |
| `root_type` | `TEXT NOT NULL` | `'income'`, `'expense'`, `'transfer'` |
| `parent_id` | `UUID NULL FK → categories` | Self-ref for hierarchy |
| `color` | `TEXT NULL` | Hex color for badge display |
| `icon` | `TEXT NULL` | Optional icon identifier |
| `is_active` | `BOOLEAN DEFAULT true` | |
| `sort_order` | `INT DEFAULT 0` | Within parent |

**Seed categories:**

- **Income:** Dividends, Interest Income, Capital Gains Distributions, Other Income
- **Expense:** Margin Interest, Account Fees, Wire Fees, ADR Fees, Other Expense
- **Transfer:** Internal Transfer, Deposit, Withdrawal

### `financialmanager.transaction_categories`

Linking table — references source transactions by account + source ID. No data copying.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `account_id` | `UUID NOT NULL FK → accounts` | Which account |
| `source_txn_id` | `TEXT NOT NULL` | PK value from source view, cast to TEXT to accommodate heterogeneous ID types across schemas (BIGINT for brokerage, INT/TEXT for others) |
| `category_id` | `UUID NOT NULL FK → categories` | Assigned category |
| `notes` | `TEXT NULL` | User annotation |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |
| `updated_at` | `TIMESTAMPTZ DEFAULT now()` | Updated via trigger |
| | `UNIQUE(account_id, source_txn_id)` | One category per transaction |

A `BEFORE UPDATE` trigger sets `updated_at = now()` automatically.

### `financialmanager.position_links`

Links PFM manual positions to `trade_analysis.position_history`.

| Column | Type | Notes |
|---|---|---|
| `id` | `UUID PK` | `gen_random_uuid()` |
| `manual_position_id` | `UUID NOT NULL` | FK → `schwab_brokerage.manual_positions` |
| `position_history_id` | `UUID NOT NULL` | FK → `trade_analysis.position_history` |
| `link_type` | `TEXT NOT NULL` | `'created'` (PFM wrote the history record) or `'linked'` (user linked to existing) |
| `created_at` | `TIMESTAMPTZ DEFAULT now()` | |
| | `UNIQUE(manual_position_id)` | One link per position |

> **Note:** Cross-schema FKs to `schwab_brokerage.manual_positions` and
> `trade_analysis.position_history`. This migration must run after migrations
> `010_manual_positions.sql` and `036_position_history.sql`.

### New Views in `schwab_brokerage`

**`v_trade_transactions`** — replaces the inline SQL in `serve.py`:
```sql
CREATE VIEW schwab_brokerage.v_trade_transactions AS
SELECT activity_id, trade_date, type, symbol, instrument_description,
       position_effect, amount, price, net_amount, commission, fees,
       sub_account, description
FROM schwab_brokerage.v_transactions
WHERE type IN ('TRADE', 'RECEIVE_AND_DELIVER');
```

**`v_nontrade_transactions`** — the inverse:
```sql
CREATE VIEW schwab_brokerage.v_nontrade_transactions AS
SELECT activity_id, trade_date, type, symbol, instrument_description,
       amount, net_amount, description, asset_type, sub_account
FROM schwab_brokerage.v_transactions
WHERE type NOT IN ('TRADE', 'RECEIVE_AND_DELIVER', 'SMA_ADJUSTMENT');
```

`SMA_ADJUSTMENT` excluded — internal margin accounting with no real cash impact.
`asset_type` and `sub_account` included for categorization context (e.g. distinguishing dividend sources).

> **Note:** The existing `schwab_brokerage.unmatched_transactions` view is preserved.
> `v_trade_transactions` is all trades (matched and unmatched); the Trade Matching tab
> continues to filter unmatched ones via the existing `NOT IN manual_position_legs` logic.

---

## UI Architecture

### Layout: Left-Nav SPA

Replace the current top tab bar + brokerage dropdown with a persistent left
sidebar. All navigation is client-side JS — single Flask route serves `pfm.html`.

```
┌──────────────────────────────────────────────────────┐
│  PFM  Personal Financial Manager          [Sign Out] │
├───────────────┬──────────────────────────────────────┤
│               │                                      │
│  ● DASHBOARD  │   (active section content)           │
│               │                                      │
│  ACCOUNTS     │                                      │
│  ▾ Brokerage  │                                      │
│    Schwab ●   │                                      │
│  ▾ Checking   │                                      │
│    Schwab     │                                      │
│  ▸ Credit     │                                      │
│               │                                      │
│  ◆ CATEGORIES │                                      │
│               │                                      │
│  ◆ REPORTS    │                                      │
│               │                                      │
│───────────────│                                      │
│  v1.0         │                                      │
└───────────────┴──────────────────────────────────────┘
```

- Sidebar: ~220px fixed width, collapsible account groups
- Active nav item highlighted with gold left border
- Account groups auto-populated from `financialmanager.accounts`
- Uncategorized badge counts next to each account name
- Content area: 100% of remaining width, scrollable

### Dashboard Page

- **Account summary cards** — one per active account, showing name, type, total transactions, uncategorized count, categorization % progress bar
- **Recent uncategorized** — last 10 uncategorized transactions across all accounts, with quick-categorize action
- **Quick stats** — total categorized, total uncategorized, income/expense/transfer totals

### Account Pages

**Brokerage accounts** — two sub-tabs at top of content area:

1. **Trade Matching** — existing Position Matching feature, re-parented here
   - Unmatched Transactions, Open Positions, Position History (existing 3 sub-tabs)
   - New: "Link to Position History" button on closed positions
2. **Non-Trade** — transaction register for categorization

**Checking/Credit Card accounts** — single transaction register view

### Transaction Register (Quicken-style)

The core categorization UI, shared across all account types:

- **Filter bar:** date range picker, category filter (incl. "Uncategorized"), text search on description, amount range
- **Table columns:** Date, Description, Amount, Category, Notes
  - Brokerage non-trade adds: Type badge (DIVIDEND_OR_INTEREST, JOURNAL, etc.)
  - Checking/CC adds: Reference #, Memo (from source columns)
- **Inline category picker:** click category cell → dropdown with:
  - Type-ahead search
  - Grouped by root type (Income / Expense / Transfer)
  - Color dot next to each category
  - "Uncategorized" option to clear
- **Bulk actions:** checkbox column, "Categorize Selected" button → modal with category picker
- **Row expand:** click row to expand detail panel (all source columns, notes field, save)
- **Sorting:** clickable column headers (existing sortable pattern)
- **Pagination:** 50 rows per page (with load-more or page nav)

### Category Manager Page

- **Tree view** with three root nodes (Income, Expense, Transfer)
- Each node shows: color dot, name, transaction count using that category
- **Actions per node:** Edit (modal), Add Child, Delete (only if no transactions linked)
- **Add Category button** at top → modal with: name, root type, parent (dropdown), color picker
- Drag-to-reorder within a parent (sort_order update)

### Reports Page (Placeholder)

- "Coming Soon" card with planned reports list:
  - Cash flow by period (monthly/quarterly/yearly)
  - Spending by category (pie/bar chart)
  - Income vs Expense trend
  - Account-level summaries
- No implementation in this iteration — just the nav item and placeholder

### Position History Linking

After a position is closed in Trade Matching:

1. A "Link to History" button appears on the position card
2. Click opens a modal:
   - **Search** existing `trade_analysis.position_history` records (by underlying, date range, strategy type)
   - **Or Create New** — pre-fills from the manual position data (legs, P&L, dates)
3. Linking writes to `financialmanager.position_links`
4. Linked positions show a badge and the history record's strategy_type

---

## API Routes

All new routes under the existing Flask app.

### Account Management
- `GET /api/accounts` — list active accounts with uncategorized counts
- `GET /api/accounts/<id>/transactions` — paginated transaction list with category join
  - Query params: `page`, `per_page`, `category_id`, `uncategorized_only`, `search`, `date_from`, `date_to`, `sort`, `order`
  - Dynamically queries the source view configured in the account record

### Category Management
- `GET /api/categories` — full tree (nested JSON)
- `POST /api/categories` — create category
- `PUT /api/categories/<id>` — update category
- `DELETE /api/categories/<id>` — delete (fails if transactions linked)
- `PUT /api/categories/reorder` — batch update sort_order

### Transaction Categorization
- `POST /api/categorize` — assign category to one transaction
  - Body: `{ account_id, source_txn_id, category_id, notes? }`
  - **Upserts:** if a categorization already exists for `(account_id, source_txn_id)`, updates the `category_id`, `notes`, and `updated_at`
- `POST /api/categorize/bulk` — assign category to multiple transactions
  - Body: `{ account_id, source_txn_ids: [...], category_id }`
  - Same upsert behavior per transaction
- `DELETE /api/categorize` — remove categorization (back to uncategorized)
  - Body: `{ account_id, source_txn_id }`
  - Uses the natural key (not the internal UUID)

### Position History Linking
- `GET /api/position-history/search` — search `trade_analysis.position_history`
  - Query params: `underlying`, `strategy_type`, `date_from`, `date_to`
- `POST /api/position-links` — create link (or create new history record + link)
  - When creating a new history record, field mapping from manual position:
    - `manual_positions.subtype` → `position_history.strategy_type`
    - `manual_positions.symbol` → `position_history.underlying`
    - `manual_positions.opened_at` → `position_history.open_date`
    - `manual_positions.closed_at` → `position_history.close_date`
    - `manual_position_legs` (opening) → `position_history.open_legs` (JSONB)
    - `manual_position_legs` (closing) → `position_history.close_legs` (JSONB)
    - `manual_positions.realized_pnl` → `position_history.net_pnl`
    - `manual_positions.total_commissions` → `position_history.total_commissions`
    - `manual_positions.total_fees` → `position_history.total_fees`
    - `contracts` derived from leg count or defaulted to 1
- `GET /api/position-links/<manual_position_id>` — get link for a position

### Dashboard
- `GET /api/dashboard/summary` — account totals, categorization progress, quick stats

**Uncategorized count query** (used by dashboard and left-nav badges):
```sql
SELECT count(*) FROM {source_schema}.{view} src
LEFT JOIN financialmanager.transaction_categories tc
  ON tc.account_id = :acct_id AND tc.source_txn_id = src.{id_column}::text
WHERE tc.id IS NULL
```

---

## File Changes

### New Files
| File | Purpose |
|---|---|
| `live/simulated/migrations/0XX_pfm_categorization.sql` | Drop/recreate `financialmanager`, new views in `schwab_brokerage` |

### Modified Files
| File | Change |
|---|---|
| `dashboard/pfm/serve.py` | New API routes, replace `_BROKERAGES` dict with DB-driven account registry |
| `dashboard/pfm/templates/pfm.html` | Left-nav layout structure |
| `dashboard/pfm/static/js/pfm.js` | SPA router, nav state, transaction register, category picker, dashboard, category manager |
| `dashboard/pfm/static/css/pfm.css` | Sidebar layout, category tree, transaction register, inline picker styles |

### No Changes
| File | Reason |
|---|---|
| Position Matching logic in `serve.py` | Existing routes stay, just nested under brokerage account nav |
| `schwab_brokerage.manual_positions/legs` | Untouched — position matching works as-is |
| `trade_analysis.position_history` | Read-only from PFM; new records written via existing schema |

---

## Migration Strategy

1. Run migration SQL: drop `financialmanager`, recreate schema, create tables + seed data, create `schwab_brokerage` views
2. Update `serve.py`: new routes, account registry from DB instead of `_BROKERAGES` dict
3. Rewrite `pfm.html`: left-nav layout
4. Rewrite `pfm.js`: SPA router + all new UI components (preserving position matching logic)
5. Extend `pfm.css`: sidebar, register, category tree styles

Existing Position Matching functionality is preserved — the JS functions and API routes
stay, just re-parented under the brokerage account's Trade Matching sub-tab.

---

## Future Iterations

1. **Add 4 credit card accounts** — add rows to `financialmanager.accounts`, point at existing `v_transactions` views
2. **Rule-based auto-categorization** — pattern matching on description → suggested category
3. **Transfer linking** — pair transactions across accounts (deposit in checking ↔ withdrawal from brokerage)
4. **Reports** — charts and period summaries using categorized data
5. **Budgeting** — budget targets by category, variance tracking
6. **Tastyworks / TradeStation** — add source schemas, configure views, add account rows
