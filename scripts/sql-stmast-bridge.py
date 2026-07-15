#!/usr/bin/env python3
"""
Minimal read-only SQL API for Vercel admin (STMAST + Positill sales and buying aggregates).

**READ ONLY — SELECT queries only. Never add write endpoints.**

Run on BLADERUNNER-PC:
  pip install pyodbc
  python scripts/sql-stmast-bridge.py

Set on Vercel (protoportal-admin):
  STOCK_SQL_BRIDGE_URL=http://<bladerunner-host>:8765
  STOCK_SQL_BRIDGE_KEY=<shared secret>
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

try:
    import pyodbc
except ModuleNotFoundError:  # Unit-test/dev environments may not have the ODBC driver.
    pyodbc = None

BRIDGE_VERSION = "1.3.0"
BUILD_GIT_COMMIT = "not-stamped"
BUILD_DATE_UTC = "not-stamped"
STARTED_AT_UTC = datetime.now(timezone.utc)
LAST_QUERY_AT_UTC: datetime | None = None


def load_env_file(path: Path) -> None:
    """Minimal .env reader so the deployed bridge has no helper dependency."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(Path(__file__).resolve().parent.parent / ".env")

SQL_SERVER = os.getenv("SQL_SERVER", "BLADERUNNER-PC")
SQL_DATABASE = os.getenv("SQL_DATABASE", "POSWINSQL")
SQL_USER = os.getenv("SQL_USER", "ProtoSyncReadOnly")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "")
BRIDGE_KEY = os.getenv("STOCK_SQL_BRIDGE_KEY", "")
PORT = int(os.getenv("STOCK_SQL_BRIDGE_PORT", "8765"))

SAST = timezone(timedelta(hours=2))

ALLOWED_PERIODS = frozenset({"today", "yesterday", "last_week", "general"})
ALLOWED_SCOPES = frozenset({"top_sellers", "worst_sellers", "revenue"})
MAX_BUYING_SKUS = 500
MAX_BUYING_MONTHS = 36
MAX_REQUEST_BYTES = 256 * 1024

STMAST_SELECT = """
    SELECT TOP 1 CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
    FROM dbo.STMAST
    WHERE CODE = ?
"""


def json_safe_value(value: Any) -> Any:
    """Convert pyodbc values to JSON-native scalars."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        numeric = float(value)
        return int(numeric) if numeric.is_integer() else numeric
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):  # SQL date values
        return value.isoformat()
    if isinstance(value, (bytes, bytearray)):
        return value.decode("utf-8", errors="replace")
    return value


def row_to_dict(columns, row) -> dict:
    return {column: json_safe_value(value) for column, value in zip(columns, row)}


def sanitize_for_json(value: Any) -> Any:
    """Recursively remove SQL/Python values that JSON cannot encode."""
    if isinstance(value, dict):
        return {str(key): sanitize_for_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_for_json(item) for item in value]
    return json_safe_value(value)


def json_default_handler(value: Any) -> Any:
    converted = json_safe_value(value)
    if converted is value:
        raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")
    return converted


def encode_json_payload(payload: dict) -> bytes:
    return json.dumps(
        sanitize_for_json(payload),
        default=json_default_handler,
        ensure_ascii=False,
    ).encode("utf-8")


def build_info() -> dict[str, str]:
    return {
        "bridge": "Apollo SQL Bridge",
        "version": BRIDGE_VERSION,
        "gitCommit": os.getenv("SQL_BRIDGE_BUILD_COMMIT", BUILD_GIT_COMMIT),
        "buildDate": os.getenv("SQL_BRIDGE_BUILD_DATE_UTC", BUILD_DATE_UTC),
        "python": f"{sys.version_info.major}.{sys.version_info.minor}",
        "sqlServer": SQL_SERVER,
        "database": SQL_DATABASE,
        "connection": "ReadOnly",
    }


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


def connect_read_only(timeout: int):
    if pyodbc is None:
        raise RuntimeError("pyodbc is required to connect to POSWINSQL")
    return pyodbc.connect(connection_string(), timeout=timeout)


def utc_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def uptime_string() -> str:
    elapsed_seconds = max(0, int((datetime.now(timezone.utc) - STARTED_AT_UTC).total_seconds()))
    hours, remainder = divmod(elapsed_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def verify_database_connection() -> bool:
    """Health check only: run a read-only scalar query against POSWINSQL."""
    global LAST_QUERY_AT_UTC
    with connect_read_only(timeout=10) as conn:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        is_connected = cur.fetchone()[0] == 1
    if is_connected:
        LAST_QUERY_AT_UTC = datetime.now(timezone.utc)
    return is_connected


def health_info() -> dict[str, Any]:
    try:
        connected = verify_database_connection()
    except Exception:  # noqa: BLE001
        connected = False

    return {
        "status": "healthy" if connected else "unhealthy",
        "database": "connected" if connected else "unavailable",
        "readOnly": True,
        "bridge": "running",
        "lastQuery": utc_iso(LAST_QUERY_AT_UTC),
        "uptime": uptime_string(),
    }


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


def shift_month_start(value: datetime, months_back: int) -> datetime:
    """Return the first day of value's SAST month shifted back by N months."""
    local = value.astimezone(SAST)
    month_index = local.year * 12 + (local.month - 1) - months_back
    year, month_zero = divmod(month_index, 12)
    return datetime(year, month_zero + 1, 1, tzinfo=SAST).astimezone(timezone.utc)


def normalize_buying_skus(raw_skus: Any) -> list[str]:
    if isinstance(raw_skus, str):
        raw_skus = raw_skus.replace("\r", "\n").replace(",", "\n").split("\n")
    if not isinstance(raw_skus, list):
        raise ValueError("skus must be an array or comma/newline-separated string")

    normalized: list[str] = []
    seen: set[str] = set()
    for raw in raw_skus:
        sku = str(raw or "").strip().upper()
        if not sku:
            continue
        if len(sku) > 64 or any(ord(char) < 32 for char in sku):
            raise ValueError("each sku must be 1-64 printable characters")
        if sku not in seen:
            normalized.append(sku)
            seen.add(sku)
    if not normalized:
        raise ValueError("at least one sku is required")
    if len(normalized) > MAX_BUYING_SKUS:
        raise ValueError(f"a maximum of {MAX_BUYING_SKUS} unique skus is allowed")
    return normalized


def normalize_buying_months(raw_months: Any) -> int:
    try:
        months = 24 if raw_months is None or raw_months == "" else int(raw_months)
    except (TypeError, ValueError) as exc:
        raise ValueError("months must be an integer") from exc
    return max(1, min(months, MAX_BUYING_MONTHS))


def rolling_units(monthly_rows: list[dict], window: int, requested_months: int) -> float | None:
    if requested_months < window:
        return None
    active_keys = {
        shift_month_start(datetime.now(timezone.utc), offset).astimezone(SAST).strftime("%Y-%m")
        for offset in range(window)
    }
    return sum(float(row.get("units") or 0) for row in monthly_rows if row.get("month") in active_keys)


def fetch_buying_history(raw_skus: Any, raw_months: Any = 24) -> dict:
    """Return a bounded, read-only stock snapshot and monthly sales history by SKU."""
    global LAST_QUERY_AT_UTC
    skus = normalize_buying_skus(raw_skus)
    months = normalize_buying_months(raw_months)
    now = datetime.now(timezone.utc)
    start = shift_month_start(now, months - 1)
    end = now
    placeholders = ",".join("?" for _ in skus)

    product_sql = f"""
        SELECT CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
        FROM dbo.STMAST
        WHERE CODE IN ({placeholders})
    """
    sales_sql = f"""
        SELECT
            d.PRODUCT AS code,
            CONVERT(char(7), h.DATE, 126) AS salesMonth,
            SUM(CAST(d.QTY AS float)) AS units,
            SUM(CAST(d.TOTAL AS float)) AS salesValue,
            COUNT(DISTINCT h.INV_NO) AS invoiceCount
        FROM dbo.DBINVDT d
        INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
        WHERE h.DATE >= ? AND h.DATE <= ?
          AND d.PRODUCT IN ({placeholders})
        GROUP BY d.PRODUCT, CONVERT(char(7), h.DATE, 126)
        ORDER BY d.PRODUCT, salesMonth
    """

    with connect_read_only(timeout=30) as conn:
        cur = conn.cursor()
        cur.execute(product_sql, *skus)
        product_cols = [column[0] for column in cur.description]
        product_rows = [row_to_dict(product_cols, row) for row in cur.fetchall()]

        cur.execute(sales_sql, start, end, *skus)
        sales_cols = [column[0] for column in cur.description]
        sales_rows = [row_to_dict(sales_cols, row) for row in cur.fetchall()]
        LAST_QUERY_AT_UTC = datetime.now(timezone.utc)

    products_by_sku = {
        str(row.get("CODE") or row.get("code") or "").strip().upper(): row
        for row in product_rows
    }
    sales_by_sku: dict[str, list[dict]] = {sku: [] for sku in skus}
    for row in sales_rows:
        code = str(row.get("code") or row.get("PRODUCT") or "").strip().upper()
        if code not in sales_by_sku:
            continue
        sales_by_sku[code].append({
            "month": str(row.get("salesMonth") or row.get("SALESMONTH") or ""),
            "units": float(row.get("units") or row.get("UNITS") or 0),
            "salesValue": float(row.get("salesValue") or row.get("SALESVALUE") or 0),
            "invoiceCount": int(row.get("invoiceCount") or row.get("INVOICECOUNT") or 0),
        })

    items = []
    for sku in skus:
        product = products_by_sku.get(sku)
        monthly = sales_by_sku.get(sku, [])
        onhand = float(product.get("ONHAND") or 0) if product else None
        booked = float(product.get("BOOKED") or 0) if product else None
        items.append({
            "code": sku,
            "found": product is not None,
            "description": str(product.get("DESCR") or "").strip() if product else None,
            "department": str(product.get("DEPT") or "").strip() if product else None,
            "priceA": float(product.get("PRICE_A") or 0) if product else None,
            "onHand": onhand,
            "booked": booked,
            "available": onhand - booked if product else None,
            "monthlySales": monthly,
            "sales": {
                "units3m": rolling_units(monthly, 3, months),
                "units6m": rolling_units(monthly, 6, months),
                "units12m": rolling_units(monthly, 12, months),
                "units24m": rolling_units(monthly, 24, months),
                "units36m": rolling_units(monthly, 36, months),
                "activeMonths": sum(1 for row in monthly if float(row.get("units") or 0) != 0),
                "invoiceCount": sum(int(row.get("invoiceCount") or 0) for row in monthly),
            },
        })

    return {
        "items": items,
        "meta": {
            "dataSource": "erp_sql",
            "readOnly": True,
            "generatedAt": utc_iso(LAST_QUERY_AT_UTC),
            "periodStart": utc_iso(start),
            "periodEnd": utc_iso(end),
            "months": months,
            "requestedSkuCount": len(skus),
            "foundSkuCount": sum(1 for item in items if item["found"]),
            "missingSkuCount": sum(1 for item in items if not item["found"]),
            "availableFields": ["stock", "booked", "department", "priceA", "monthlySales"],
            "notAvailable": ["openPurchaseOrders", "supplierPurchaseHistory", "supplierLeadTime", "moq", "packSize"],
        },
    }


def order_clause(scope: str) -> str:
    safe = scope if scope in ALLOWED_SCOPES else "top_sellers"
    if safe == "worst_sellers":
        return "SUM(CAST(d.QTY AS float)) ASC"
    if safe == "revenue":
        return "SUM(CAST(d.TOTAL AS float)) DESC"
    return "SUM(CAST(d.QTY AS float)) DESC"


def fetch_row(sku: str) -> dict | None:
    global LAST_QUERY_AT_UTC
    with connect_read_only(timeout=20) as conn:
        cur = conn.cursor()
        cur.execute(STMAST_SELECT, sku)
        row = cur.fetchone()
        LAST_QUERY_AT_UTC = datetime.now(timezone.utc)
        if not row:
            return None
        cols = [c[0] for c in cur.description]
        return row_to_dict(cols, row)


def fetch_top_sellers(period: str, scope: str, limit: int) -> dict:
    global LAST_QUERY_AT_UTC
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

    with connect_read_only(timeout=25) as conn:
        cur = conn.cursor()
        cur.execute(count_sql, start, end)
        cnt_row = cur.fetchone()
        invoice_header_count = int(cnt_row[0]) if cnt_row else 0

        cur.execute(top_sql, start, end)
        cols = [c[0] for c in cur.description]
        items = [row_to_dict(cols, row) for row in cur.fetchall()]
        LAST_QUERY_AT_UTC = datetime.now(timezone.utc)

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
        body = encode_json_payload(payload)
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _version(self) -> None:
        health = health_info()
        status_code = 200 if health["status"] == "healthy" else 503
        self._json(status_code, {**build_info(), "status": health["status"], "uptime": health["uptime"]})

    def _health(self) -> None:
        health = health_info()
        self._json(200 if health["status"] == "healthy" else 503, health)

    def do_GET(self) -> None:
        path = self.path.rstrip("/")
        if path not in ("/version", "/health"):
            self._json(404, {"error": "Not found"})
            return
        if not self._auth_ok():
            self._json(401, {"error": "Unauthorized"})
            return
        if path == "/version":
            self._version()
        else:
            self._health()

    def do_POST(self) -> None:
        path = self.path.rstrip("/")
        if path not in ("/stmast", "/top-sellers", "/buying-history", "/version", "/health"):
            self._json(404, {"error": "Not found"})
            return
        if not self._auth_ok():
            self._json(401, {"error": "Unauthorized"})
            return
        if path == "/version":
            self._version()
            return
        if path == "/health":
            self._health()
            return
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_REQUEST_BYTES:
            self._json(413, {"error": "Request body too large"})
            return
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

            if path == "/buying-history":
                payload = fetch_buying_history(data.get("skus"), data.get("months", 24))
                self._json(200, payload)
                return

            period = str(data.get("period") or "today")
            scope = str(data.get("scope") or "top_sellers")
            limit = int(data.get("limit") or 10)
            payload = fetch_top_sellers(period, scope, limit)
            self._json(200, payload)
        except ValueError as exc:
            self._json(400, {"error": str(exc)[:500]})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)[:500]})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[sql-bridge] {self.address_string()} - {fmt % args}")


def main() -> None:
    if not SQL_PASSWORD:
        raise SystemExit("SQL_PASSWORD required")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    info = build_info()
    print(
        "Proto SQL Bridge "
        f"version={info['version']} gitCommit={info['gitCommit']} buildDate={info['buildDate']}",
        flush=True,
    )
    print(f"SQL bridge listening on :{PORT} (/version, /health, /stmast, /top-sellers, /buying-history)")
    server.serve_forever()


if __name__ == "__main__":
    main()
