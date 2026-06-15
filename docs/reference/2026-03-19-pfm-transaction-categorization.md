# PFM Transaction Categorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transaction categorization, left-nav SPA layout, and position history linking to the PFM app, with Schwab Brokerage non-trade and Schwab Checking as the initial two account types.

**Architecture:** Drop/recreate `financialmanager` schema with 4 tables (accounts, categories, transaction_categories, position_links). Add two views to `schwab_brokerage` (v_trade_transactions, v_nontrade_transactions). Rewrite the PFM Flask app from top-bar tabs to a left-nav SPA with client-side routing. All new API routes are added to the existing `serve.py`.

**Tech Stack:** Python/Flask, PostgreSQL (psycopg), vanilla JS SPA, Walnut & Brass CSS design system

**Spec:** `docs/superpowers/specs/2026-03-19-pfm-transaction-categorization-design.md`

**Security Note:** All HTML in this app is built from our own PostgreSQL data. User-facing strings are escaped via `escHtml()`. The existing `setTrustedHtml()` pattern is used throughout — all content is from authenticated DB queries, not external user input. The app is a single-user PIN-authenticated private tool.

---

## File Structure

### New Files
| File | Responsibility |
|---|---|
| `live/simulated/migrations/041_pfm_categorization.sql` | Drop/recreate `financialmanager` schema, create brokerage views, seed data |

### Modified Files
| File | Responsibility |
|---|---|
| `dashboard/pfm/serve.py` | Replace `_BROKERAGES` dict with DB-driven accounts; add 13 new API routes for accounts, categories, categorization, position links, dashboard |
| `dashboard/pfm/templates/pfm.html` | Replace top-bar tab layout with left-nav sidebar + content area |
| `dashboard/pfm/static/js/pfm.js` | SPA router, left-nav state, dashboard page, transaction register, category picker, category manager, position history linking — preserving all existing position matching logic |
| `dashboard/pfm/static/css/pfm.css` | Sidebar, category tree, transaction register, inline picker, progress bar styles |

---

## Task 1: Database Migration

**Files:**
- Create: `live/simulated/migrations/041_pfm_categorization.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 041: PFM Transaction Categorization
-- Drops old financialmanager schema, recreates with clean tables.
-- Adds trade/nontrade views to schwab_brokerage.

BEGIN;

-- ======================================================================
-- 1. Thermonuclear the old schema
-- ======================================================================
DROP SCHEMA IF EXISTS financialmanager CASCADE;
CREATE SCHEMA financialmanager;

-- ======================================================================
-- 2. Account registry
-- ======================================================================
CREATE TABLE financialmanager.accounts (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name                TEXT NOT NULL,
    account_type        TEXT NOT NULL CHECK (account_type IN ('brokerage', 'checking', 'credit_card')),
    source_schema       TEXT NOT NULL,
    trade_view          TEXT,           -- brokerage only
    nontrade_view       TEXT,           -- brokerage only
    txn_view            TEXT,           -- checking/CC
    id_column           TEXT NOT NULL,
    date_column         TEXT NOT NULL,
    description_column  TEXT NOT NULL,
    amount_column       TEXT NOT NULL,
    is_active           BOOLEAN NOT NULL DEFAULT true,
    display_order       INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: 2 accounts
INSERT INTO financialmanager.accounts (name, account_type, source_schema, trade_view, nontrade_view, txn_view, id_column, date_column, description_column, amount_column, display_order)
VALUES
    ('Schwab Brokerage', 'brokerage', 'schwab_brokerage', 'v_trade_transactions', 'v_nontrade_transactions', NULL, 'activity_id', 'trade_date', 'description', 'net_amount', 1),
    ('Schwab Checking',  'checking',  'schwab_checking',  NULL,                   NULL,                      'v_transactions', 'transaction_id', 'transaction_date', 'description', 'amount', 2);

-- ======================================================================
-- 3. Category hierarchy
-- ======================================================================
CREATE TABLE financialmanager.categories (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name            TEXT NOT NULL,
    root_type       TEXT NOT NULL CHECK (root_type IN ('income', 'expense', 'transfer')),
    parent_id       UUID REFERENCES financialmanager.categories(id) ON DELETE SET NULL,
    color           TEXT,
    icon            TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent ON financialmanager.categories(parent_id);
CREATE INDEX idx_categories_root_type ON financialmanager.categories(root_type);

-- Seed categories
INSERT INTO financialmanager.categories (name, root_type, color, sort_order) VALUES
    ('Dividends',                'income',   '#5a9e6f', 1),
    ('Interest Income',          'income',   '#6ab07f', 2),
    ('Capital Gains Distributions','income', '#7ac08f', 3),
    ('Other Income',             'income',   '#4a8e5f', 4),
    ('Margin Interest',          'expense',  '#b05555', 1),
    ('Account Fees',             'expense',  '#c06565', 2),
    ('Wire Fees',                'expense',  '#d07575', 3),
    ('ADR Fees',                 'expense',  '#e08585', 4),
    ('Other Expense',            'expense',  '#a04545', 5),
    ('Internal Transfer',        'transfer', '#5a7faa', 1),
    ('Deposit',                  'transfer', '#6a8fba', 2),
    ('Withdrawal',               'transfer', '#4a6f9a', 3);

-- ======================================================================
-- 4. Transaction to category linking
-- ======================================================================
CREATE TABLE financialmanager.transaction_categories (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id      UUID NOT NULL REFERENCES financialmanager.accounts(id),
    source_txn_id   TEXT NOT NULL,   -- cast to TEXT for heterogeneous ID types
    category_id     UUID NOT NULL REFERENCES financialmanager.categories(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id, source_txn_id)
);

CREATE INDEX idx_txn_cat_account ON financialmanager.transaction_categories(account_id);
CREATE INDEX idx_txn_cat_category ON financialmanager.transaction_categories(category_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION financialmanager.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_txn_cat_updated
    BEFORE UPDATE ON financialmanager.transaction_categories
    FOR EACH ROW EXECUTE FUNCTION financialmanager.set_updated_at();

-- ======================================================================
-- 5. Position to position_history linking
-- ======================================================================
CREATE TABLE financialmanager.position_links (
    id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    manual_position_id   UUID NOT NULL,   -- references schwab_brokerage.manual_positions
    position_history_id  UUID NOT NULL,   -- references trade_analysis.position_history
    link_type            TEXT NOT NULL CHECK (link_type IN ('created', 'linked')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(manual_position_id)
);

-- NOTE: Cross-schema FKs omitted intentionally. The application enforces
-- referential integrity. This avoids hard dependency ordering between schemas.

-- ======================================================================
-- 6. Schwab brokerage views (trade / non-trade split)
-- ======================================================================

-- All trade-type transactions (matched and unmatched)
CREATE OR REPLACE VIEW schwab_brokerage.v_trade_transactions AS
SELECT activity_id, trade_date, type, symbol, instrument_description,
       position_effect, amount, price, net_amount, commission, fees,
       sub_account, description
FROM schwab_brokerage.v_transactions
WHERE type IN ('TRADE', 'RECEIVE_AND_DELIVER');

-- Non-trade transactions (dividends, interest, journals, deposits, withdrawals)
CREATE OR REPLACE VIEW schwab_brokerage.v_nontrade_transactions AS
SELECT activity_id, trade_date, type, symbol, instrument_description,
       amount, net_amount, description, asset_type, sub_account
FROM schwab_brokerage.v_transactions
WHERE type NOT IN ('TRADE', 'RECEIVE_AND_DELIVER', 'SMA_ADJUSTMENT');

COMMIT;
```

- [ ] **Step 2: Run the migration**

Run: `source .venv/Scripts/activate && python -c "
import psycopg, os
conn_str = os.environ['POSTGRES_CONNECTION_STRING'].replace('postgresql+psycopg://', 'postgresql://')
with open('live/simulated/migrations/041_pfm_categorization.sql', encoding='utf-8') as f:
    sql = f.read()
with psycopg.connect(conn_str, autocommit=True) as conn:
    conn.execute(sql)
print('Migration 041 applied successfully')
"`

Expected: "Migration 041 applied successfully"

- [ ] **Step 3: Verify the migration**

Run: `source .venv/Scripts/activate && python -c "
import psycopg, os
conn_str = os.environ['POSTGRES_CONNECTION_STRING'].replace('postgresql+psycopg://', 'postgresql://')
with psycopg.connect(conn_str) as conn:
    cur = conn.cursor()
    cur.execute('SELECT count(*) FROM financialmanager.accounts')
    print(f'Accounts: {cur.fetchone()[0]}')
    cur.execute('SELECT count(*) FROM financialmanager.categories')
    print(f'Categories: {cur.fetchone()[0]}')
    cur.execute('SELECT count(*) FROM schwab_brokerage.v_nontrade_transactions')
    print(f'Non-trade txns: {cur.fetchone()[0]}')
    cur.execute('SELECT count(*) FROM schwab_brokerage.v_trade_transactions')
    print(f'Trade txns: {cur.fetchone()[0]}')
"`

Expected: Accounts: 2, Categories: 12, Non-trade txns: ~209, Trade txns: ~3039

- [ ] **Step 4: Commit**

```bash
git add live/simulated/migrations/041_pfm_categorization.sql
git commit -m "feat(pfm): add migration 041 -- financialmanager schema, brokerage views"
```

---

## Task 2: Flask API -- Account & Category Routes

**Files:**
- Modify: `dashboard/pfm/serve.py`

This task adds the account registry, category CRUD, and dashboard summary routes. The existing position matching routes are preserved unchanged.

- [ ] **Step 1: Add `_execute` helper for write operations**

Add after `_serialize()` (line 88) in `serve.py`:

```python
def _execute(sql, params=None):
    """Execute a write query (INSERT/UPDATE/DELETE), return affected rows."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            try:
                result = cur.fetchall()
            except psycopg.ProgrammingError:
                result = []
        conn.commit()
    return result
```

- [ ] **Step 2: Add account API routes**

Add after the brokerage registry section (after line 153 in original `serve.py`). Keep `_BROKERAGES` and `/api/brokerages` for now -- they will be removed in Task 9 when the UI is rewired.

```python
# -- Account registry (DB-driven) ------------------------------------------

@app.route("/api/accounts")
@login_required
def api_accounts():
    """List active accounts with uncategorized transaction counts."""
    accounts = _query("""
        SELECT id, name, account_type, source_schema, trade_view, nontrade_view,
               txn_view, id_column, date_column, description_column, amount_column,
               display_order
        FROM financialmanager.accounts
        WHERE is_active = true
        ORDER BY display_order
    """)
    result = _serialize(accounts)

    # Compute uncategorized counts per account
    for acct in result:
        try:
            view = acct.get("nontrade_view") or acct.get("txn_view")
            if not view:
                acct["uncategorized_count"] = 0
                acct["total_count"] = 0
                continue
            schema = acct["source_schema"]
            id_col = acct["id_column"]
            # Safe: schema/view/id_col come from admin-seeded DB rows, not user input
            count_sql = f"""
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE tc.id IS NULL) AS uncategorized
                FROM {schema}.{view} src
                LEFT JOIN financialmanager.transaction_categories tc
                    ON tc.account_id = %s AND tc.source_txn_id = src.{id_col}::text
            """
            counts = _query(count_sql, [acct["id"]])
            acct["total_count"] = counts[0]["total"] if counts else 0
            acct["uncategorized_count"] = counts[0]["uncategorized"] if counts else 0
        except Exception:
            acct["uncategorized_count"] = 0
            acct["total_count"] = 0
    return jsonify(result)
```

- [ ] **Step 3: Add category CRUD routes**

```python
# -- Category management ----------------------------------------------------

@app.route("/api/categories")
@login_required
def api_categories():
    """Full category list (flat -- client builds tree)."""
    rows = _query("""
        SELECT c.id, c.name, c.root_type, c.parent_id, c.color, c.icon,
               c.is_active, c.sort_order,
               count(tc.id) AS usage_count
        FROM financialmanager.categories c
        LEFT JOIN financialmanager.transaction_categories tc ON tc.category_id = c.id
        WHERE c.is_active = true
        GROUP BY c.id
        ORDER BY c.root_type, c.sort_order, c.name
    """)
    return jsonify(_serialize(rows))


@app.route("/api/categories", methods=["POST"])
@login_required
def api_create_category():
    data = request.get_json()
    name = data.get("name", "").strip()
    root_type = data.get("root_type")
    if not name or root_type not in ("income", "expense", "transfer"):
        return jsonify({"error": "name and valid root_type required"}), 400
    rows = _execute("""
        INSERT INTO financialmanager.categories (name, root_type, parent_id, color, sort_order)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
    """, [name, root_type, data.get("parent_id"), data.get("color"), data.get("sort_order", 0)])
    return jsonify({"id": str(rows[0]["id"]), "status": "created"})


@app.route("/api/categories/<cat_id>", methods=["PUT"])
@login_required
def api_update_category(cat_id):
    data = request.get_json()
    sets, params = [], []
    for field in ("name", "root_type", "parent_id", "color", "icon", "sort_order"):
        if field in data:
            sets.append(f"{field} = %s")
            params.append(data[field])
    if not sets:
        return jsonify({"error": "nothing to update"}), 400
    params.append(cat_id)
    _execute(f"UPDATE financialmanager.categories SET {', '.join(sets)} WHERE id = %s", params)
    return jsonify({"status": "updated"})


@app.route("/api/categories/<cat_id>", methods=["DELETE"])
@login_required
def api_delete_category(cat_id):
    # Check for linked transactions
    linked = _query("SELECT count(*) AS cnt FROM financialmanager.transaction_categories WHERE category_id = %s", [cat_id])
    if linked and linked[0]["cnt"] > 0:
        return jsonify({"error": f"Cannot delete: {linked[0]['cnt']} transactions use this category"}), 400
    _execute("UPDATE financialmanager.categories SET is_active = false WHERE id = %s", [cat_id])
    return jsonify({"status": "deleted"})


@app.route("/api/categories/reorder", methods=["PUT"])
@login_required
def api_reorder_categories():
    data = request.get_json()
    order = data.get("order", [])  # [{id, sort_order}, ...]
    for item in order:
        _execute("UPDATE financialmanager.categories SET sort_order = %s WHERE id = %s",
                 [item["sort_order"], item["id"]])
    return jsonify({"status": "reordered"})
```

- [ ] **Step 4: Add dashboard summary route**

```python
# -- Dashboard ---------------------------------------------------------------

@app.route("/api/dashboard/summary")
@login_required
def api_dashboard_summary():
    """Account totals and categorization progress."""
    accounts = _query("""
        SELECT id, name, account_type, source_schema, nontrade_view, txn_view,
               id_column, display_order
        FROM financialmanager.accounts WHERE is_active = true ORDER BY display_order
    """)
    result = []
    totals = {"categorized": 0, "uncategorized": 0, "income": 0, "expense": 0, "transfer": 0}

    for acct in accounts:
        view = acct.get("nontrade_view") or acct.get("txn_view")
        if not view:
            continue
        schema = acct["source_schema"]
        id_col = acct["id_column"]
        try:
            counts = _query(f"""
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE tc.id IS NULL) AS uncategorized,
                    count(*) FILTER (WHERE tc.id IS NOT NULL) AS categorized
                FROM {schema}.{view} src
                LEFT JOIN financialmanager.transaction_categories tc
                    ON tc.account_id = %s AND tc.source_txn_id = src.{id_col}::text
            """, [acct["id"]])
            c = counts[0] if counts else {"total": 0, "uncategorized": 0, "categorized": 0}
            totals["categorized"] += c["categorized"]
            totals["uncategorized"] += c["uncategorized"]
            result.append({
                "id": str(acct["id"]),
                "name": acct["name"],
                "account_type": acct["account_type"],
                "total": c["total"],
                "categorized": c["categorized"],
                "uncategorized": c["uncategorized"],
            })
        except Exception:
            pass

    # Income/expense/transfer totals from categorized transactions
    try:
        type_totals = _query("""
            SELECT c.root_type, count(*) AS cnt
            FROM financialmanager.transaction_categories tc
            JOIN financialmanager.categories c ON c.id = tc.category_id
            GROUP BY c.root_type
        """)
        for row in type_totals:
            if row["root_type"] in totals:
                totals[row["root_type"]] = row["cnt"]
    except Exception:
        pass

    return jsonify({"accounts": result, "totals": totals})
```

- [ ] **Step 5: Verify routes load without errors**

Run: `source .venv/Scripts/activate && python -c "from dashboard.pfm.serve import app; print('Flask app loaded OK')"`

Expected: "Flask app loaded OK"

- [ ] **Step 6: Commit**

```bash
git add dashboard/pfm/serve.py
git commit -m "feat(pfm): add account, category, and dashboard API routes"
```

---

## Task 3: Flask API -- Transaction Categorization & Position Link Routes

**Files:**
- Modify: `dashboard/pfm/serve.py`

- [ ] **Step 1: Add transaction listing route**

```python
# -- Transaction listing (per account) --------------------------------------

@app.route("/api/accounts/<acct_id>/transactions")
@login_required
def api_account_transactions(acct_id):
    """Paginated transaction list with category join."""
    accts = _query("SELECT * FROM financialmanager.accounts WHERE id = %s", [acct_id])
    if not accts:
        return jsonify({"error": "Account not found"}), 404
    acct = accts[0]

    view_type = request.args.get("view", "nontrade")  # 'trade', 'nontrade', or 'all'
    if acct["account_type"] == "brokerage":
        view = acct["trade_view"] if view_type == "trade" else acct["nontrade_view"]
    else:
        view = acct["txn_view"]
    if not view:
        return jsonify({"error": f"No view configured for {view_type}"}), 400

    schema = acct["source_schema"]
    id_col = acct["id_column"]
    date_col = acct["date_column"]
    amt_col = acct["amount_column"]
    desc_col = acct["description_column"]

    # Pagination
    page = max(1, int(request.args.get("page", 1)))
    per_page = min(200, max(10, int(request.args.get("per_page", 50))))
    offset = (page - 1) * per_page

    # Filters
    wheres, params = [], [acct_id]
    uncat_only = request.args.get("uncategorized_only") == "true"
    search = request.args.get("search", "").strip()
    category_id = request.args.get("category_id")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    if search:
        wheres.append(f"src.{desc_col} ILIKE %s")
        params.append(f"%{search}%")
    if date_from:
        wheres.append(f"src.{date_col} >= %s")
        params.append(date_from)
    if date_to:
        wheres.append(f"src.{date_col} <= %s")
        params.append(date_to)
    if uncat_only:
        wheres.append("tc.id IS NULL")
    elif category_id:
        wheres.append("tc.category_id = %s")
        params.append(category_id)

    where_clause = (" AND " + " AND ".join(wheres)) if wheres else ""

    # Sort
    sort_col = request.args.get("sort", date_col)
    # Allowlist sort columns to prevent injection
    allowed_sorts = {date_col, desc_col, amt_col, "category_name"}
    if sort_col not in allowed_sorts:
        sort_col = date_col
    order = "ASC" if request.args.get("order", "desc").lower() == "asc" else "DESC"

    if sort_col == "category_name":
        order_clause = f"c.name {order} NULLS LAST"
    else:
        order_clause = f"src.{sort_col} {order}"

    sql = f"""
        SELECT src.*, tc.id AS tc_id, tc.category_id, tc.notes AS cat_notes,
               c.name AS category_name, c.root_type AS category_type, c.color AS category_color
        FROM {schema}.{view} src
        LEFT JOIN financialmanager.transaction_categories tc
            ON tc.account_id = %s AND tc.source_txn_id = src.{id_col}::text
        LEFT JOIN financialmanager.categories c ON c.id = tc.category_id
        WHERE 1=1 {where_clause}
        ORDER BY {order_clause}
        LIMIT {per_page} OFFSET {offset}
    """

    try:
        rows = _query(sql, params)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    # Total count for pagination
    count_sql = f"""
        SELECT count(*) AS total
        FROM {schema}.{view} src
        LEFT JOIN financialmanager.transaction_categories tc
            ON tc.account_id = %s AND tc.source_txn_id = src.{id_col}::text
        LEFT JOIN financialmanager.categories c ON c.id = tc.category_id
        WHERE 1=1 {where_clause}
    """
    try:
        count_rows = _query(count_sql, params)
        total = count_rows[0]["total"] if count_rows else 0
    except Exception:
        total = len(rows)

    return jsonify({
        "transactions": _serialize(rows),
        "page": page,
        "per_page": per_page,
        "total": total,
        "pages": max(1, (total + per_page - 1) // per_page),
    })
```

- [ ] **Step 2: Add categorization routes**

```python
# -- Transaction categorization ----------------------------------------------

@app.route("/api/categorize", methods=["POST"])
@login_required
def api_categorize():
    """Assign or update a category for a single transaction (upsert)."""
    data = request.get_json()
    account_id = data.get("account_id")
    source_txn_id = str(data.get("source_txn_id", ""))
    category_id = data.get("category_id")
    notes = data.get("notes")
    if not all([account_id, source_txn_id, category_id]):
        return jsonify({"error": "account_id, source_txn_id, category_id required"}), 400
    try:
        _execute("""
            INSERT INTO financialmanager.transaction_categories (account_id, source_txn_id, category_id, notes)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (account_id, source_txn_id)
            DO UPDATE SET category_id = EXCLUDED.category_id, notes = EXCLUDED.notes
        """, [account_id, source_txn_id, category_id, notes])
        return jsonify({"status": "categorized"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/categorize/bulk", methods=["POST"])
@login_required
def api_categorize_bulk():
    """Assign category to multiple transactions (upsert each)."""
    data = request.get_json()
    account_id = data.get("account_id")
    source_txn_ids = data.get("source_txn_ids", [])
    category_id = data.get("category_id")
    if not all([account_id, source_txn_ids, category_id]):
        return jsonify({"error": "account_id, source_txn_ids, category_id required"}), 400
    try:
        for txn_id in source_txn_ids:
            _execute("""
                INSERT INTO financialmanager.transaction_categories (account_id, source_txn_id, category_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (account_id, source_txn_id)
                DO UPDATE SET category_id = EXCLUDED.category_id
            """, [account_id, str(txn_id), category_id])
        return jsonify({"status": "categorized", "count": len(source_txn_ids)})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/categorize", methods=["DELETE"])
@login_required
def api_uncategorize():
    """Remove categorization (back to uncategorized)."""
    data = request.get_json()
    account_id = data.get("account_id")
    source_txn_id = str(data.get("source_txn_id", ""))
    if not all([account_id, source_txn_id]):
        return jsonify({"error": "account_id, source_txn_id required"}), 400
    try:
        _execute("""
            DELETE FROM financialmanager.transaction_categories
            WHERE account_id = %s AND source_txn_id = %s
        """, [account_id, source_txn_id])
        return jsonify({"status": "uncategorized"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
```

- [ ] **Step 3: Add position history linking routes**

```python
# -- Position history linking ------------------------------------------------

@app.route("/api/position-history/search")
@login_required
def api_position_history_search():
    """Search trade_analysis.position_history for linking."""
    underlying = request.args.get("underlying", "")
    strategy_type = request.args.get("strategy_type", "")
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")

    wheres, params = [], []
    if underlying:
        wheres.append("underlying ILIKE %s")
        params.append(f"%{underlying}%")
    if strategy_type:
        wheres.append("strategy_type ILIKE %s")
        params.append(f"%{strategy_type}%")
    if date_from:
        wheres.append("open_date >= %s")
        params.append(date_from)
    if date_to:
        wheres.append("open_date <= %s")
        params.append(date_to)

    where_clause = (" AND " + " AND ".join(wheres)) if wheres else ""
    rows = _query(f"""
        SELECT position_id, strategy_type, underlying, expiration, open_date, close_date,
               is_closed, net_pnl, contracts, notes
        FROM trade_analysis.position_history
        WHERE 1=1 {where_clause}
        ORDER BY open_date DESC
        LIMIT 50
    """, params)
    return jsonify(_serialize(rows))


@app.route("/api/position-links", methods=["POST"])
@login_required
def api_create_position_link():
    """Link a manual position to a position_history record, or create one."""
    data = request.get_json()
    manual_position_id = data.get("manual_position_id")
    position_history_id = data.get("position_history_id")
    create_new = data.get("create_new", False)

    if not manual_position_id:
        return jsonify({"error": "manual_position_id required"}), 400

    try:
        if create_new:
            # Get manual position data for pre-fill
            positions = _query("""
                SELECT p.*, array_agg(json_build_object(
                    'symbol', l.symbol, 'leg_type', l.leg_type, 'amount', l.amount,
                    'price', l.price, 'net_amount', l.net_amount, 'trade_date', l.trade_date
                )) AS legs
                FROM schwab_brokerage.manual_positions p
                LEFT JOIN schwab_brokerage.manual_position_legs l USING (position_id)
                WHERE p.position_id = %s
                GROUP BY p.position_id
            """, [manual_position_id])
            if not positions:
                return jsonify({"error": "Manual position not found"}), 404
            mp = positions[0]
            legs = mp.get("legs", [])
            open_legs = [l for l in legs if l and l.get("leg_type") == "opening"]
            close_legs = [l for l in legs if l and l.get("leg_type") == "closing"]

            # Create position_history record
            result = _execute("""
                INSERT INTO trade_analysis.position_history
                (strategy_type, underlying, open_date, open_legs, close_date, close_legs,
                 is_closed, net_pnl, total_commissions, total_fees, contracts, notes)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING position_id
            """, [
                mp.get("subtype") or "unknown",
                mp.get("symbol") or "unknown",
                mp.get("opened_at"),
                json.dumps(_serialize(open_legs)),
                mp.get("closed_at"),
                json.dumps(_serialize(close_legs)) if close_legs else None,
                mp.get("status") == "closed",
                mp.get("net_pnl"),
                mp.get("total_commissions"),
                mp.get("total_fees"),
                max(1, len(open_legs)),
                mp.get("notes"),
            ])
            position_history_id = str(result[0]["position_id"])
            link_type = "created"
        else:
            if not position_history_id:
                return jsonify({"error": "position_history_id required when not creating new"}), 400
            link_type = "linked"

        _execute("""
            INSERT INTO financialmanager.position_links
            (manual_position_id, position_history_id, link_type)
            VALUES (%s, %s, %s)
            ON CONFLICT (manual_position_id) DO UPDATE
            SET position_history_id = EXCLUDED.position_history_id, link_type = EXCLUDED.link_type
        """, [manual_position_id, position_history_id, link_type])

        return jsonify({"status": "linked", "position_history_id": position_history_id, "link_type": link_type})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/position-links/<manual_position_id>")
@login_required
def api_get_position_link(manual_position_id):
    """Get link for a manual position."""
    rows = _query("""
        SELECT pl.*, ph.strategy_type, ph.underlying, ph.open_date, ph.net_pnl, ph.is_closed
        FROM financialmanager.position_links pl
        JOIN trade_analysis.position_history ph ON ph.position_id = pl.position_history_id
        WHERE pl.manual_position_id = %s
    """, [manual_position_id])
    if not rows:
        return jsonify(None)
    return jsonify(_serialize(rows)[0])
```

- [ ] **Step 4: Verify all routes load**

Run: `source .venv/Scripts/activate && python -c "
from dashboard.pfm.serve import app
rules = [r.rule for r in app.url_map.iter_rules() if r.rule.startswith('/api/')]
for r in sorted(rules):
    print(r)
"`

Expected: Should list all original routes plus the new ones.

- [ ] **Step 5: Commit**

```bash
git add dashboard/pfm/serve.py
git commit -m "feat(pfm): add transaction listing, categorization, and position linking routes"
```

---

## Task 4: HTML Template -- Left-Nav Layout

**Files:**
- Modify: `dashboard/pfm/templates/pfm.html`

- [ ] **Step 1: Rewrite the HTML template**

Replace the entire `pfm.html` with the left-nav layout:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PFM -- Personal Financial Manager</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&family=DM+Sans:wght@400;500&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/pfm.css">
</head>
<body>
<div class="top-bar">
  <div class="brand">
    <span class="brand-mark">PFM</span>
    <span class="brand-title">Personal Financial Manager</span>
  </div>
  <div class="top-actions">
    <a href="/logout" class="btn btn-ghost btn-sm">Sign Out</a>
  </div>
</div>

<div class="app-layout">
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-section">
      <a class="nav-item active" data-page="dashboard" href="#dashboard">Dashboard</a>
    </div>
    <div class="sidebar-section">
      <div class="sidebar-heading">Accounts</div>
      <div id="nav-accounts"><div class="loading-state" style="padding:8px">Loading...</div></div>
    </div>
    <div class="sidebar-section">
      <a class="nav-item" data-page="categories" href="#categories">Categories</a>
    </div>
    <div class="sidebar-section">
      <a class="nav-item" data-page="reports" href="#reports">Reports</a>
    </div>
    <div class="sidebar-version">v1.0</div>
  </nav>

  <main class="content-area" id="page-content">
    <div class="loading-state">Loading...</div>
  </main>
</div>

<!-- Modal -->
<div class="modal-overlay" id="modal-overlay" onclick="closeModal()">
  <div class="modal-card" onclick="event.stopPropagation()">
    <div class="modal-header">
      <h3 id="modal-title"></h3>
      <button class="modal-close" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body" id="modal-body"></div>
  </div>
</div>

<!-- Toast -->
<div id="toast-container"></div>

<script src="/static/js/pfm.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/pfm/templates/pfm.html
git commit -m "feat(pfm): left-nav SPA layout replacing top tab bar"
```

---

## Task 5: CSS -- Sidebar & New Component Styles

**Files:**
- Modify: `dashboard/pfm/static/css/pfm.css`

- [ ] **Step 1: Add all new CSS styles**

Append to the end of `pfm.css` (all existing styles are kept). See the design spec for the full set of new CSS classes. Key additions:

- `.app-layout` -- flexbox container for sidebar + content
- `.sidebar` -- 220px fixed left nav
- `.content-area` -- main area with left margin
- `.nav-item`, `.nav-sub-item` -- navigation links with gold active state
- `.nav-group` -- collapsible account groups
- `.nav-badge` -- uncategorized count badges
- `.sub-tab-bar` -- for brokerage Trade/Non-Trade sub-tabs
- `.filter-bar` -- transaction register filter controls
- `.category-cell`, `.category-badge` -- inline category display
- `.category-dropdown` -- type-ahead category picker overlay
- `.category-tree-*` -- category manager tree view
- `.progress-bar` -- dashboard progress bars
- `.pagination` -- transaction register pagination

The implementer should write the full CSS for all these components, following the existing Walnut & Brass design tokens (dark backgrounds, gold accents, Cormorant Garamond display font, DM Sans body, JetBrains Mono for data).

- [ ] **Step 2: Commit**

```bash
git add dashboard/pfm/static/css/pfm.css
git commit -m "feat(pfm): sidebar, transaction register, category tree, and component styles"
```

---

## Task 6: JavaScript -- SPA Router & Left Nav

**Files:**
- Modify: `dashboard/pfm/static/js/pfm.js`

This is the largest task. The existing JS (~440 lines) handles position matching. We preserve ALL existing functions (`renderUnmatched`, `renderOpen`, `renderHistory`) and wrap them in the new SPA router.

- [ ] **Step 1: Replace the state and init sections**

Replace the `State` section (lines 141-156) and `Init` section (lines 158-173) with new state variables for the SPA:

- `_page` (dashboard/account/categories/reports)
- `_activeAccountId`, `_activeAccountType`
- `_accountSubTab` (trade/nontrade for brokerage)
- `_accounts[]`, `_categories[]` (cached from API)
- `_txnPage`, `_txnSearch`, `_txnUncatOnly`, etc. (transaction register state)
- Keep all existing position matching state (`_tab`, `_selected`, `_effectFilter`, `_symbolFilter`, `_brokerage`)

Init: load accounts + categories from API, call `buildNav()`, then `navigateTo('dashboard')`.

- [ ] **Step 2: Add the navigation system**

- `buildNav()` -- populates `#nav-accounts` from `_accounts`, grouped by type, with collapsible groups and uncategorized badges
- `navigateTo(page)` -- updates active states, calls `renderPage()`
- `renderPage()` -- dispatches to `renderDashboard()`, `renderAccountPage()`, `renderCategoryManager()`, or `renderReports()`

- [ ] **Step 3: Add Dashboard page renderer**

`renderDashboard()` -- calls `GET /api/dashboard/summary`, renders stat cards and per-account progress bars.

- [ ] **Step 4: Add Account page renderer with sub-tabs**

`renderAccountPage()` -- for brokerage accounts, renders Trade Matching / Non-Trade sub-tabs. Trade Matching delegates to the existing `render()` function. Non-Trade calls `renderTransactionRegister()`.

**IMPORTANT:** When rendering the Trade Matching sub-tab, the HTML must include a `<div class="sub-tab-bar" id="tab-bar"></div>` and a `<div id="trade-content"></div>` container. The existing `render()` function depends on `#tab-bar` existing in the DOM (line 178: `var tabBar = document.getElementById('tab-bar')`). Without this element, position matching breaks with a null reference error. The `#register-content` and `#trade-content` divs are created dynamically by `renderAccountPage()` JS — they are NOT in the static HTML template.

For checking/CC accounts, renders a single transaction register (creates `#register-content` dynamically).

- [ ] **Step 5: Rewire `setPageContent` to be context-aware**

The existing `setPageContent()` always writes to `#page-content`. Update it to also check for `#register-content` or `#trade-content` sub-containers when inside an account page. The existing `renderUnmatched()`, `renderOpen()`, and `renderHistory()` functions call `setPageContent()` — when inside the Trade Matching sub-tab, this should write to `#trade-content` instead of `#page-content`, so position matching renders within the account page rather than replacing the entire page.

- [ ] **Step 6: Commit**

```bash
git add dashboard/pfm/static/js/pfm.js
git commit -m "feat(pfm): SPA router, left nav, dashboard, and account page with sub-tabs"
```

---

## Task 7: JavaScript -- Transaction Register

**Files:**
- Modify: `dashboard/pfm/static/js/pfm.js`

- [ ] **Step 1: Add the transaction register renderer**

`renderTransactionRegister(acct)` -- the core categorization UI:
- Calls `GET /api/accounts/<id>/transactions` with pagination, search, filter params
- Renders filter bar (search, category dropdown, uncategorized toggle)
- Renders table with date, description, type/ref, amount, category columns
- Category column uses `buildCategoryBadge()` for inline display
- Checkbox column for bulk selection
- Pagination controls

- [ ] **Step 2: Add inline category picker**

- `buildCategoryBadge(txn, accountId, txnId)` -- renders colored badge or "+ Categorize" placeholder
- `wireInlineCategoryPickers(acct)` -- click handler on category cells
- `showCategoryDropdown(cell, accountId, txnId, acct)` -- renders the dropdown overlay with type-ahead search, grouped by root type, calls `POST /api/categorize` on selection
- `openBulkCategorizeModal(accountId)` -- modal for bulk categorization
- `refreshNavBadges()` -- re-fetches accounts and rebuilds nav after categorization

- [ ] **Step 3: Commit**

```bash
git add dashboard/pfm/static/js/pfm.js
git commit -m "feat(pfm): transaction register with inline category picker and bulk categorize"
```

---

## Task 8: JavaScript -- Category Manager & Reports Placeholder

**Files:**
- Modify: `dashboard/pfm/static/js/pfm.js`

- [ ] **Step 1: Add the category manager page**

`renderCategoryManager()` -- tree view with 3 root nodes (Income, Expense, Transfer):
- Each category shows color dot, name, usage count
- Add button per root type (opens modal with name + color picker)
- Edit button per category (modal)
- Delete button per category (blocks if usage_count > 0)

- [ ] **Step 2: Add the reports placeholder**

`renderReports()` -- "Coming Soon" card listing planned reports.

- [ ] **Step 3: Commit**

```bash
git add dashboard/pfm/static/js/pfm.js
git commit -m "feat(pfm): category manager page and reports placeholder"
```

---

## Task 9: Remove Old Brokerage Registry & Clean Up serve.py

**Files:**
- Modify: `dashboard/pfm/serve.py`

- [ ] **Step 1: Remove `_BROKERAGES` dict, `api_brokerages` route, and rewrite `api_unmatched`**

The HTML no longer has the brokerage dropdown. Remove the `_BROKERAGES` dict (lines 131-153) and the `/api/brokerages` route.

**IMPORTANT:** `api_unmatched` currently depends on `_BROKERAGES` for its SQL query (line 171: `brk = _BROKERAGES.get(brokerage)`). Rewrite it to query `schwab_brokerage.unmatched_transactions` directly:

```python
@app.route("/api/unmatched")
@login_required
def api_unmatched():
    effect = request.args.get("effect")
    symbol = request.args.get("symbol")
    try:
        sql = """
            SELECT activity_id, trade_date, type, symbol, instrument_description,
                   position_effect, amount, price, net_amount, commission, fees,
                   sub_account, description
            FROM schwab_brokerage.unmatched_transactions
            WHERE 1=1
        """
        params = []
        if effect:
            sql += " AND position_effect = %s"
            params.append(effect)
        if symbol:
            sql += " AND symbol ILIKE %s"
            params.append(f"%{symbol}%")
        sql += " ORDER BY trade_date DESC LIMIT 500"
        rows = _query(sql, params)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(_serialize(rows))
```

This uses the existing `schwab_brokerage.unmatched_transactions` view (from migration 010) which already filters to trades not in `manual_position_legs`.

- [ ] **Step 2: Verify the app still starts**

Run: `source .venv/Scripts/activate && python -c "from dashboard.pfm.serve import app; print('OK')"`

Expected: "OK"

- [ ] **Step 3: Commit**

```bash
git add dashboard/pfm/serve.py
git commit -m "refactor(pfm): remove old _BROKERAGES registry, replaced by DB-driven accounts"
```

---

## Task 10: Smoke Test & Manual Verification

**Files:** None (testing only)

- [ ] **Step 1: Start the PFM app**

Run: `source .venv/Scripts/activate && python dashboard/pfm/serve.py --port 8070`

Open browser to `http://localhost:8070`, log in with PIN.

- [ ] **Step 2: Verify Dashboard**

- Dashboard loads with account cards for Schwab Brokerage and Schwab Checking
- Uncategorized counts are shown
- Progress bars render

- [ ] **Step 3: Verify Schwab Brokerage -- Trade Matching**

- Click "Schwab Brokerage" in left nav
- "Trade Matching" sub-tab is active by default
- Existing position matching UI works (Unmatched, Open Positions, History tabs)

- [ ] **Step 4: Verify Schwab Brokerage -- Non-Trade**

- Click "Non-Trade" sub-tab
- Transaction register loads with ~209 non-trade transactions
- Type badges show (DIVIDEND_OR_INTEREST, JOURNAL, etc.)
- Click a category cell -- dropdown appears with type-ahead
- Select a category -- transaction updates inline
- Bulk select + categorize works

- [ ] **Step 5: Verify Schwab Checking**

- Click "Schwab Checking" in left nav
- Transaction register loads with ~588 transactions
- Reference # column shows
- Categorization works the same way

- [ ] **Step 6: Verify Categories page**

- Click "Categories" in left nav
- Tree view shows 3 root types with seeded categories
- Add a new category -- appears in tree
- Edit a category name/color -- updates
- Delete an unused category -- removes

- [ ] **Step 7: Verify nav badges update**

- After categorizing some transactions, left nav badge counts decrease
- Dashboard progress bars update on refresh

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "feat(pfm): transaction categorization -- complete initial implementation"
```
