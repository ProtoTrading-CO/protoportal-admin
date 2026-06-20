#!/usr/bin/env python3
"""
Minimal STMAST read API for Vercel admin (same SQL env as product_image_intake.py).

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
        if self.path.rstrip("/") != "/stmast":
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
        sku = str(data.get("sku") or "").strip().upper()
        if not sku:
            self._json(400, {"error": "sku required"})
            return
        try:
            row = fetch_row(sku)
            self._json(200, {"row": row})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": str(exc)[:500]})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[sql-bridge] {self.address_string()} - {fmt % args}")


def main() -> None:
    if not SQL_PASSWORD:
        raise SystemExit("SQL_PASSWORD required")
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"STMAST bridge listening on :{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    main()
