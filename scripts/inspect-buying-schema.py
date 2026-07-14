#!/usr/bin/env python3
"""Print column metadata for approved POSWINSQL buying tables. Read-only metadata query."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pyodbc


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.strip()
        if not value or value.startswith("#") or "=" not in value:
            continue
        key, raw = value.split("=", 1)
        os.environ.setdefault(key.strip(), raw.strip().strip('"').strip("'"))


load_env(Path(__file__).resolve().parent.parent / ".env")

TABLES = ("STMAST", "DBINVHD", "DBINVDT", "STGRVHD", "STGRVDT", "STSALES", "CRINVHD", "CRINVDT")


def connection_string() -> str:
    password = os.getenv("SQL_PASSWORD", "")
    if not password:
        raise SystemExit("SQL_PASSWORD required")
    return (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={os.getenv('SQL_SERVER', 'BLADERUNNER-PC')};"
        f"DATABASE={os.getenv('SQL_DATABASE', 'POSWINSQL')};"
        f"UID={os.getenv('SQL_USER', 'ProtoSyncReadOnly')};"
        f"PWD={password};ApplicationIntent=ReadOnly;Encrypt=no;"
    )


def main() -> None:
    placeholders = ",".join("?" for _ in TABLES)
    query = f"""
        SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ({placeholders})
        ORDER BY TABLE_NAME, ORDINAL_POSITION
    """
    result: dict[str, list[dict]] = {table: [] for table in TABLES}
    with pyodbc.connect(connection_string(), timeout=20) as connection:
        cursor = connection.cursor()
        cursor.execute(query, *TABLES)
        for table, column, data_type, ordinal in cursor.fetchall():
            result[str(table)].append({
                "column": str(column), "type": str(data_type), "ordinal": int(ordinal),
            })
    print(json.dumps({"readOnly": True, "tables": result}, indent=2))


if __name__ == "__main__":
    main()
