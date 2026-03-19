"""
Personal Financial Manager — private dashboard for transaction reconciliation.

Standalone Flask app, separate from the Board Dashboard.
Manages manual position matching across multiple brokerages.

Usage:
    python dashboard/pfm/serve.py                    # start on :8090
    python dashboard/pfm/serve.py --port 8080        # custom port
"""
from __future__ import annotations

import json
import os
import secrets
import sys
from datetime import datetime, timedelta
from decimal import Decimal
from functools import wraps
from pathlib import Path

import psycopg
import psycopg.rows
from flask import (
    Flask, request, redirect, session, jsonify,
    send_from_directory, render_template,
)
from dotenv import load_dotenv

load_dotenv()

_PFM_DIR = Path(__file__).resolve().parent
_PROJECT_ROOT = _PFM_DIR.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

app = Flask(
    __name__,
    static_folder=str(_PFM_DIR / "static"),
    template_folder=str(_PFM_DIR / "templates"),
)
app.secret_key = os.environ.get("PFM_SECRET_KEY", secrets.token_hex(32))
if not os.getenv("PFM_SECRET_KEY"):
    print("[WARNING] PFM_SECRET_KEY not set. Set in .env for persistent sessions.")
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(hours=24)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_NAME"] = "pfm_session"


# ── DB helpers ──────────────────────────────────────────────────────────

_CONN_STR = os.environ.get("POSTGRES_CONNECTION_STRING", "").replace(
    "postgresql+psycopg://", "postgresql://")


def _get_conn():
    return psycopg.connect(_CONN_STR, row_factory=psycopg.rows.dict_row)


def _query(sql, params=None):
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return cur.fetchall()


def _serialize(rows):
    """Make rows JSON-safe."""
    if isinstance(rows, dict):
        rows = [rows]
    result = []
    for row in rows:
        clean = {}
        for k, v in row.items():
            if isinstance(v, datetime):
                clean[k] = v.isoformat()
            elif hasattr(v, "hex"):
                clean[k] = str(v)
            elif isinstance(v, Decimal):
                clean[k] = float(v)
            elif isinstance(v, timedelta):
                total_hours = v.total_seconds() / 3600
                clean[k] = f"{total_hours:.1f}h"
            else:
                clean[k] = v
        result.append(clean)
    return result


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


# ── Simple auth (PIN-based, private app) ────────────────────────────────

_PFM_PIN = os.environ.get("PFM_PIN", "1234")


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("pfm_auth"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if request.form.get("pin") == _PFM_PIN:
            session["pfm_auth"] = True
            session.permanent = True
            return redirect("/")
        error = "Incorrect PIN."
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect("/login")


@app.route("/")
@login_required
def index():
    return render_template("pfm.html")


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


@app.route("/api/positions")
@login_required
def api_positions():
    status = request.args.get("status", "open")
    brokerage = request.args.get("brokerage")
    try:
        brk_filter = ""
        params = [status, status]
        if brokerage:
            brk_filter = " AND p.brokerage = %s"
            params = [status, brokerage, status]
        rows = _query(f"""
            SELECT p.*, array_agg(json_build_object(
                'leg_id', l.leg_id, 'activity_id', l.activity_id,
                'leg_type', l.leg_type, 'trade_date', l.trade_date,
                'symbol', l.symbol, 'description', l.description,
                'amount', l.amount, 'price', l.price,
                'net_amount', l.net_amount, 'commission', l.commission, 'fees', l.fees
            ) ORDER BY l.trade_date) AS legs
            FROM schwab_brokerage.manual_positions p
            LEFT JOIN schwab_brokerage.manual_position_legs l USING (position_id)
            WHERE p.status = %s {brk_filter}
            GROUP BY p.position_id
            ORDER BY CASE WHEN %s = 'open' THEN p.opened_at ELSE p.closed_at END DESC NULLS LAST
        """, params)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    return jsonify(_serialize(rows))


@app.route("/api/open-position", methods=["POST"])
@login_required
def api_open_position():
    data = request.get_json()
    activity_ids = data.get("activity_ids", [])
    instrument_type = data.get("instrument_type")
    subtype = data.get("subtype")
    notes = data.get("notes")
    brokerage = data.get("brokerage", "schwab")
    if not activity_ids:
        return jsonify({"error": "activity_ids required"}), 400
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO schwab_brokerage.manual_positions "
                "(instrument_type, subtype, notes, brokerage) VALUES (%s, %s, %s, %s) RETURNING position_id",
                [instrument_type, subtype, notes, brokerage],
            )
            position_id = str(cur.fetchone()["position_id"])
            for aid in activity_ids:
                cur.execute("""
                    INSERT INTO schwab_brokerage.manual_position_legs
                    (position_id, activity_id, leg_type, trade_date, symbol, description, amount, price, net_amount, commission, fees, brokerage)
                    SELECT %s, t.activity_id, 'opening', t.trade_date, t.symbol, t.instrument_description,
                           t.amount, t.price, t.net_amount, t.commission, t.fees, %s
                    FROM schwab_brokerage.v_transactions t
                    WHERE t.activity_id = %s
                """, [position_id, brokerage, aid])
            cur.execute("""
                UPDATE schwab_brokerage.manual_positions SET
                    symbol = (SELECT symbol FROM schwab_brokerage.manual_position_legs WHERE position_id = %s ORDER BY trade_date LIMIT 1),
                    description = (SELECT description FROM schwab_brokerage.manual_position_legs WHERE position_id = %s AND description IS NOT NULL ORDER BY trade_date LIMIT 1),
                    opened_at = (SELECT min(trade_date) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    total_open_cost = (SELECT COALESCE(sum(net_amount), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s AND leg_type = 'opening'),
                    total_commissions = (SELECT COALESCE(sum(commission), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    total_fees = (SELECT COALESCE(sum(fees), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    updated_at = now()
                WHERE position_id = %s
            """, [position_id]*7)
        conn.commit()
        conn.close()
        return jsonify({"status": "created", "position_id": position_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/close-position", methods=["POST"])
@login_required
def api_close_position():
    data = request.get_json()
    position_id = data.get("position_id")
    activity_ids = data.get("activity_ids", [])
    brokerage = data.get("brokerage", "schwab")
    if not position_id or not activity_ids:
        return jsonify({"error": "position_id and activity_ids required"}), 400
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            for aid in activity_ids:
                cur.execute("""
                    INSERT INTO schwab_brokerage.manual_position_legs
                    (position_id, activity_id, leg_type, trade_date, symbol, description, amount, price, net_amount, commission, fees, brokerage)
                    SELECT %s, t.activity_id, 'closing', t.trade_date, t.symbol, t.instrument_description,
                           t.amount, t.price, t.net_amount, t.commission, t.fees, %s
                    FROM schwab_brokerage.v_transactions t
                    WHERE t.activity_id = %s
                """, [position_id, brokerage, aid])
            cur.execute("""
                UPDATE schwab_brokerage.manual_positions SET
                    status = 'closed',
                    closed_at = (SELECT max(trade_date) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s AND leg_type = 'closing'),
                    total_open_cost = (SELECT COALESCE(sum(net_amount), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s AND leg_type = 'opening'),
                    total_close_proceeds = (SELECT COALESCE(sum(net_amount), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s AND leg_type = 'closing'),
                    total_commissions = (SELECT COALESCE(sum(commission), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    total_fees = (SELECT COALESCE(sum(fees), 0) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    hold_duration = (SELECT max(trade_date) - min(trade_date) FROM schwab_brokerage.manual_position_legs WHERE position_id = %s),
                    updated_at = now()
                WHERE position_id = %s
            """, [position_id]*7)
            cur.execute("""
                UPDATE schwab_brokerage.manual_positions SET
                    realized_pnl = total_close_proceeds + total_open_cost,
                    net_pnl = (total_close_proceeds + total_open_cost) - total_commissions - total_fees
                WHERE position_id = %s
            """, [position_id])
        conn.commit()
        conn.close()
        return jsonify({"status": "closed", "position_id": position_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/update-position", methods=["POST"])
@login_required
def api_update_position():
    data = request.get_json()
    position_id = data.get("position_id")
    if not position_id:
        return jsonify({"error": "position_id required"}), 400
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            sets, params = [], []
            for field in ("instrument_type", "subtype", "notes"):
                if field in data:
                    sets.append(f"{field} = %s")
                    params.append(data[field])
            if sets:
                sets.append("updated_at = now()")
                params.append(position_id)
                cur.execute(f"UPDATE schwab_brokerage.manual_positions SET {', '.join(sets)} WHERE position_id = %s", params)
        conn.commit()
        conn.close()
        return jsonify({"status": "updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/remove-leg", methods=["POST"])
@login_required
def api_remove_leg():
    data = request.get_json()
    leg_id = data.get("leg_id")
    if not leg_id:
        return jsonify({"error": "leg_id required"}), 400
    try:
        conn = _get_conn()
        with conn.cursor() as cur:
            cur.execute("DELETE FROM schwab_brokerage.manual_position_legs WHERE leg_id = %s", [leg_id])
        conn.commit()
        conn.close()
        return jsonify({"status": "removed"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# -- Account registry (DB-driven) ------------------------------------------

@app.route("/api/accounts")
@login_required
def api_accounts():
    """List active accounts with uncategorized transaction counts."""
    accounts = _query("""
        SELECT id, name, account_type, source_schema, trade_view, nontrade_view,
               txn_view, id_column, date_column, description_column, amount_column,
               display_order, balance_forward_amount, balance_forward_date
        FROM financialmanager.accounts
        WHERE is_active = true
        ORDER BY display_order
    """)
    result = _serialize(accounts)

    for acct in result:
        try:
            view = acct.get("nontrade_view") or acct.get("txn_view")
            if not view:
                acct["uncategorized_count"] = 0
                acct["total_count"] = 0
                continue
            schema = acct["source_schema"]
            id_col = acct["id_column"]
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


@app.route("/api/accounts/<acct_id>/balance-forward", methods=["PUT"])
@login_required
def api_update_balance_forward(acct_id):
    """Update balance forward amount and date for an account."""
    data = request.get_json()
    amount = data.get("balance_forward_amount")
    date = data.get("balance_forward_date")
    try:
        _execute("""
            UPDATE financialmanager.accounts
            SET balance_forward_amount = %s, balance_forward_date = %s
            WHERE id = %s
        """, [amount, date or None, acct_id])
        return jsonify({"status": "updated"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
    linked = _query("SELECT count(*) AS cnt FROM financialmanager.transaction_categories WHERE category_id = %s", [cat_id])
    if linked and linked[0]["cnt"] > 0:
        return jsonify({"error": f"Cannot delete: {linked[0]['cnt']} transactions use this category"}), 400
    _execute("UPDATE financialmanager.categories SET is_active = false WHERE id = %s", [cat_id])
    return jsonify({"status": "deleted"})


@app.route("/api/categories/reorder", methods=["PUT"])
@login_required
def api_reorder_categories():
    data = request.get_json()
    order = data.get("order", [])
    for item in order:
        _execute("UPDATE financialmanager.categories SET sort_order = %s WHERE id = %s",
                 [item["sort_order"], item["id"]])
    return jsonify({"status": "reordered"})


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


# -- Transaction listing (per account) --------------------------------------

@app.route("/api/accounts/<acct_id>/transactions")
@login_required
def api_account_transactions(acct_id):
    """Paginated transaction list with category join."""
    accts = _query("SELECT * FROM financialmanager.accounts WHERE id = %s", [acct_id])
    if not accts:
        return jsonify({"error": "Account not found"}), 404
    acct = accts[0]

    view_type = request.args.get("view", "nontrade")
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

    page = max(1, int(request.args.get("page", 1)))
    per_page = min(200, max(10, int(request.args.get("per_page", 50))))
    offset = (page - 1) * per_page

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

    sort_col = request.args.get("sort", date_col)
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


# ── CLI ─────────────────────────────────────────────────────────────────

def cli():
    import argparse
    parser = argparse.ArgumentParser(description="Personal Financial Manager")
    parser.add_argument("--port", type=int, default=8090, help="Server port (default 8090)")
    parser.add_argument("--host", default="0.0.0.0", help="Server host")
    args = parser.parse_args()

    print(f"Personal Financial Manager — http://{args.host}:{args.port}")
    print(f"Default PIN: {_PFM_PIN} (set PFM_PIN in .env to change)")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    cli()
