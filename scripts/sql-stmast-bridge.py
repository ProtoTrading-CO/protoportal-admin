#!/usr/bin/env python3
"""
Minimal read-only SQL API for Vercel admin (STMAST + Positill sales aggregates).

**READ ONLY — SELECT queries only. Never add write endpoints.**

Run on BLADERUNNER-PC:
  pip install pyodbc python-dotenv
  python scripts/sql-stmast-bridge.py

Set on Vercel (protoportal-admin):
  STOCK_SQL_BRIDGE_URL=http://<bladerunner-host>:8765
  STOCK_SQL_BRIDGE_KEY=<shared secret>
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pyodbc
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

SQL_SERVER = os.getenv("SQL_SERVER", "BLADERUNNER-PC")
SQL_DATABASE = os.getenv("SQL_DATABASE", "POSWINSQL")
SQL_USER = os.getenv("SQL_USER", "ProtoSyncReadOnly")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "")
BRIDGE_KEY = os.getenv("STOCK_SQL_BRIDGE_KEY", "")
PORT = int(os.getenv("STOCK_SQL_BRIDGE_PORT", "8765"))

SAST = timezone(timedelta(hours=2))

ALLOWED_PERIODS = frozenset({"today", "yesterday", "last_week", "general"})
ALLOWED_SCOPES = frozenset({"top_sellers", "worst_sellers", "revenue"})


def connection_string() -> str:
    return (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PASSWORD};"
        "ApplicationIntent=ReadOnly;"
        "Encrypt=no;"
    )


def sast_period_bounds(period: str, now: datetime | None = None) -> tuple[datetime, datetime, str]:
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(SAST)
    day_start = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)

    if period == "today":
        return day_start, now, "today (Positill · SAST)"
    if period == "yesterday":
        y_start = day_start - timedelta(days=1)
        return y_start, day_start, "yesterday (Positill · SAST)"
    if period == "last_week":
        return day_start - timedelta(days=7), now, "last 7 days (Positill)"
    return now - timedelta(days=30), now, "last 30 days (Positill)"


def order_clause(scope: str) -> str:
    safe = scope if scope in ALLOWED_SCOPES else "top_sellers"
    if safe == "worst_sellers":
        return "SUM(CAST(d.QTY AS float)) ASC"
    if safe == "revenue":
        return "SUM(CAST(d.TOTAL AS float)) DESC"
    return "SUM(CAST(d.QTY AS float)) DESC"


def fetch_row(sku: str) -> dict | None:
    with pyodbc.connect(connection_string(), timeout=20) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT TOP 1 CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
            FROM dbo.STMAST
            WHERE CODE = ?
            """,
            sku,
        )
        row = cur.fetchone()
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        return dict(zip(cols, row))


def fetch_top_sellers(period: str, scope: str, limit: int) -> dict:
    safe_period = period if period in ALLOWED_PERIODS else "today"
    safe_scope = scope if scope in ALLOWED_SCOPES else "top_sellers"
    start, end, label = sast_period_bounds(safe_period)
    order = order_clause(safe_scope)
    limit = max(1, min(int(limit or 10), 25))

    top_sql = f"""
        SELECT TOP ({limit})
            d.PRODUCT AS code,
            MAX(d.DESCR) AS title,
            SUM(CAST(d.QTY AS float)) AS totalQty,
            SUM(CAST(d.TOTAL AS float)) AS totalValue,
            COUNT(DISTINCT h.INV_NO) AS invoiceCount
        FROM dbo.DBINVDT d
        INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
        WHERE h.DATE >= ? AND h.DATE < ?
          AND d.PRODUCT IS NOT NULL AND LTRIM(RTRIM(d.PRODUCT)) <> ''
        GROUP BY d.PRODUCT
        ORDER BY {order}
    """
    count_sql = """
        SELECT COUNT(*) AS invoiceCount
        FROM dbo.DBINVHD
        WHERE DATE >= ? AND DATE < ?
    """

    with pyodbc.connect(connection_string(), timeout=25) as conn:
        cur = conn.cursor()
        cur.execute(count_sql, start, end)
        cnt_row = cur.fetchone()
        invoice_header_count = int(cnt_row[0]) if cnt_row else 0

        cur.execute(top_sql, start, end)
        cols = [c[0] for c in cur.description]
        items = [dict(zip(cols, row)) for row in cur.fetchall()]

    return {
        "items": items,
        "invoiceHeaderCount": invoice_header_count,
        "periodLabel": label,
    }


class Handler(BaseHTTPRequestHandler):
    def _auth_ok(self) -> bool:
        if not BRIDGE_KEY:
            return True
        return self.headers.get("x-api-key") == BRIDGE_KEY

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path not in ("/stmast", "/top-sellers"):
            self._json(404, {"error": "Not found"})
            return
        if not self._auth_ok():
            self._json(401, {"error": "Unauthorized"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

        try:
            if path == "/stmast":
                sku = str(data.get("sku") or "").strip().upper()
                if not sku:
                    self._json(400, {"error": "sku required"})
                    return
                row = fetch_row(sku)
                self._json(200, {"row": row})
                return

            period = str(data.get("period") or "today")
            scope = str(data.get("scope") or "top_sellers")
            limit = int(data.get("limit") or 10)
            payload = fetch_top_sellers(period, scope, limit)
            self._json(200, payload)
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)[:500]})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[sql-bridge] {self.address_string()} - {fmt % args}")


def main() -> None:
    if not SQL_PASSWORD:
        raise SystemExit("SQL_PASSWORD required")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SQL bridge listening on :{PORT} (/stmast, /top-sellers)")
    server.serve_forever()


if __name__ == "__main__":
    main()
