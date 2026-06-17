#!/usr/bin/env python3
"""
Product image intake — folder watcher for BLADERUNNER-PC.

Reads NewImages/, looks up SKU in SQL (read-only), uploads only when the SKU
already exists in Supabase products. Does not create products.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import shutil
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pyodbc
from dotenv import load_dotenv
from supabase import create_client

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

NEW_IMAGES_DIR = Path(os.getenv("IMAGE_INTAKE_FOLDER", str(BASE_DIR / "NewImages")))
PROCESSED_DIR = Path(os.getenv("IMAGE_INTAKE_PROCESSED_FOLDER", str(BASE_DIR / "ProcessedImages")))
FAILED_DIR = Path(os.getenv("IMAGE_INTAKE_FAILED_FOLDER", str(BASE_DIR / "FailedImages")))

REPORT_MD_PATH = BASE_DIR / "product_image_intake_report.md"
REPORT_JSON_PATH = BASE_DIR / "product_image_intake_report.json"

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://yiqsvwajozafvalwcero.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "products")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "product-images")
DRY_RUN = os.getenv("DRY_RUN", "true").lower() == "true"
MAX_FILES = int(os.getenv("IMAGE_INTAKE_MAX_FILES", "0"))

SQL_SERVER = os.getenv("SQL_SERVER", "BLADERUNNER-PC")
SQL_DATABASE = os.getenv("SQL_DATABASE", "POSWINSQL")
SQL_USER = os.getenv("SQL_USER", "ProtoSyncReadOnly")
SQL_PASSWORD = os.getenv("SQL_PASSWORD", "")

IMAGE_COLUMNS = ["image_url_one", "image_url_two", "image_url_three", "image_url_four"]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}
FILENAME_WITH_IMAGE_NUMBER_PATTERN = re.compile(r"^(?P<sku>.+)-(?P<image_number>\d+)$")

FORBIDDEN_SQL_TOKENS = {
    "INSERT", "UPDATE", "DELETE", "ALTER", "DROP", "CREATE", "MERGE", "TRUNCATE", "EXEC", "EXECUTE", "BACKUP",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_read_only_sql(query: str) -> str:
    stripped = query.strip()
    upper = stripped.upper()
    if not upper.startswith("SELECT"):
        raise RuntimeError("Blocked SQL Server command because it is not a SELECT statement.")
    for token in FORBIDDEN_SQL_TOKENS:
        if token in upper:
            raise RuntimeError(f"Blocked SQL Server command containing forbidden token: {token}")
    return stripped


def build_connection_string() -> str:
    return (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={SQL_DATABASE};"
        f"UID={SQL_USER};"
        f"PWD={SQL_PASSWORD};"
        "ApplicationIntent=ReadOnly;"
        "Encrypt=no;"
    )


def parse_filename(path: Path) -> tuple[str, int, str]:
    stem = path.stem.strip()
    match = FILENAME_WITH_IMAGE_NUMBER_PATTERN.match(stem)
    if match:
        sku = str(match.group("sku") or "").strip().upper()
        slot = min(4, max(1, int(match.group("image_number") or "1")))
    else:
        sku = stem.upper()
        slot = 1
    return sku, slot, IMAGE_COLUMNS[slot - 1]


def storage_object_path(sku: str, image_number: int) -> str:
    return f"{sku}/{image_number}.jpg"


def wait_for_stable_file(path: Path, checks: int = 4, delay: float = 0.75) -> bool:
    last_size = -1
    for _ in range(checks):
        if not path.is_file():
            return False
        size = path.stat().st_size
        if size > 0 and size == last_size:
            return True
        last_size = size
        time.sleep(delay)
    return path.is_file() and path.stat().st_size > 0 and path.stat().st_size == last_size


def list_intake_files() -> list[Path]:
    if not NEW_IMAGES_DIR.is_dir():
        return []
    files = [
        p for p in sorted(NEW_IMAGES_DIR.iterdir())
        if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS and not p.name.startswith(".")
    ]
    return files[:MAX_FILES] if MAX_FILES > 0 else files


def fetch_sql_row(connection, sku: str) -> dict | None:
    query = validate_read_only_sql(
        """
        SELECT TOP 1 CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
        FROM dbo.STMAST
        WHERE CODE = ?
        """
    )
    cur = connection.cursor()
    cur.execute(query, sku)
    row = cur.fetchone()
    if not row:
        return None
    columns = [column[0] for column in cur.description]
    return dict(zip(columns, row))


def product_exists(sb, sku: str) -> bool:
    res = sb.table(SUPABASE_TABLE).select("sku").eq("sku", sku).limit(1).execute()
    return bool(res.data)


def upload_image(sb, path: Path, sku: str, image_number: int) -> str:
    object_path = storage_object_path(sku, image_number)
    body = path.read_bytes()
    content_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"
    sb.storage.from_(SUPABASE_STORAGE_BUCKET).upload(
        object_path,
        body,
        file_options={"content-type": content_type, "upsert": "true"},
    )
    return sb.storage.from_(SUPABASE_STORAGE_BUCKET).get_public_url(object_path)


def update_product_image(sb, sku: str, image_column: str, image_url: str) -> None:
    sb.table(SUPABASE_TABLE).update({
        image_column: image_url,
        "updated_at": utc_now(),
    }).eq("sku", sku).execute()


def move_file(src: Path, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = dest_dir / src.name
    if target.exists():
        target = dest_dir / f"{int(time.time())}-{src.name}"
    shutil.move(str(src), str(target))
    return target


def write_reports(results: list[dict], started_at: str) -> None:
    finished_at = utc_now()
    summary = {
        "started_at": started_at,
        "finished_at": finished_at,
        "dry_run": DRY_RUN,
        "max_files": MAX_FILES,
        "processed": len(results),
        "ok": sum(1 for r in results if r.get("status") == "ok"),
        "failed": sum(1 for r in results if r.get("status") == "failed"),
        "skipped": sum(1 for r in results if r.get("status") == "skipped"),
        "rows": results,
    }
    REPORT_JSON_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    lines = [
        "# Product image intake report",
        "",
        f"- Started: {started_at}",
        f"- Finished: {finished_at}",
        f"- Dry run: **{DRY_RUN}**",
        f"- OK: {summary['ok']} | Failed: {summary['failed']} | Skipped: {summary['skipped']}",
        "",
        "| File | SKU | Img | Status | Storage path | Notes |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for row in results:
        lines.append(
            f"| {row.get('file', '')} | {row.get('sku', '')} | {row.get('image_number', '')} "
            f"| {row.get('status', '')} | {row.get('storage_path', '')} | {row.get('message', '')} |"
        )
    REPORT_MD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def process_file(sb, sql_conn, path: Path) -> dict:
    sku, image_number, image_column = parse_filename(path)
    storage_path = f"{SUPABASE_STORAGE_BUCKET}/{storage_object_path(sku, image_number)}"
    result = {
        "file": path.name,
        "sku": sku,
        "image_number": image_number,
        "image_column": image_column,
        "storage_path": storage_path,
        "status": "failed",
        "message": "",
    }

    if not wait_for_stable_file(path):
        result["message"] = "File not stable yet — wait for sync/copy to finish"
        return result

    sql_row = fetch_sql_row(sql_conn, sku)
    if not sql_row:
        result["status"] = "skipped"
        result["message"] = f"SKU {sku} not found in SQL Server (dbo.STMAST)"
        if not DRY_RUN:
            move_file(path, FAILED_DIR)
        return result

    exists = product_exists(sb, sku)
    if not exists:
        result["status"] = "skipped"
        result["message"] = f"SKU {sku} not in Supabase {SUPABASE_TABLE} — not uploaded (no product creation)"
        if not DRY_RUN:
            move_file(path, FAILED_DIR)
        return result

    if DRY_RUN:
        result["status"] = "ok"
        result["message"] = (
            f"DRY RUN: would upload to {storage_path} and update {image_column} on {SUPABASE_TABLE}"
        )
        return result

    try:
        sb.storage.create_bucket(SUPABASE_STORAGE_BUCKET, options={"public": True})
    except Exception:
        pass

    image_url = upload_image(sb, path, sku, image_number)
    update_product_image(sb, sku, image_column, image_url)

    result["status"] = "ok"
    result["image_url"] = image_url
    result["message"] = f"Uploaded to {storage_path}"
    move_file(path, PROCESSED_DIR)
    return result


def main() -> int:
    if not SUPABASE_KEY:
        print("SUPABASE_SERVICE_ROLE_KEY is required in .env", file=sys.stderr)
        return 1
    if not SQL_PASSWORD:
        print("SQL_PASSWORD is required in .env", file=sys.stderr)
        return 1

    for folder in (NEW_IMAGES_DIR, PROCESSED_DIR, FAILED_DIR):
        folder.mkdir(parents=True, exist_ok=True)

    files = list_intake_files()
    if not files:
        print(f"No images in {NEW_IMAGES_DIR}")
        return 0

    print(f"Mode: {'DRY RUN' if DRY_RUN else 'LIVE'} | Files: {len(files)} | Folder: {NEW_IMAGES_DIR}")

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    started_at = utc_now()
    results: list[dict] = []

    with pyodbc.connect(build_connection_string(), autocommit=False, timeout=20) as sql_conn:
        for path in files:
            print(f"Processing {path.name}...")
            try:
                row = process_file(sb, sql_conn, path)
            except Exception as exc:  # noqa: BLE001
                row = {
                    "file": path.name,
                    "sku": parse_filename(path)[0],
                    "status": "failed",
                    "message": str(exc)[:500],
                }
                if not DRY_RUN:
                    try:
                        move_file(path, FAILED_DIR)
                    except Exception:
                        pass
            results.append(row)
            print(f"  [{row['status']}] {row.get('message', '')}")

    write_reports(results, started_at)
    print(f"Report: {REPORT_MD_PATH}")
    return 0 if all(r.get("status") == "ok" for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
