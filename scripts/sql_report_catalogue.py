"""Approved read-only SQL report catalogue for POSWINSQL. No arbitrary SQL."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

SKU_RE = re.compile(r"^[A-Z0-9][A-Z0-9._-]{0,63}$")
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

SAST = timezone(timedelta(hours=2))

REPORT_CATALOGUE: dict[str, dict[str, Any]] = {
    "inventory.product_lookup": {
        "title": "Product lookup",
        "description": "Read-only STMAST row for one Proto SKU.",
        "category": "inventory",
        "maxRows": 1,
        "parameters": {
            "sku": {"type": "string", "required": True, "description": "Proto SKU / item code"},
        },
    },
    "inventory.stock_by_department": {
        "title": "Stock by department",
        "description": "STMAST stock rows for a department, optionally negative available only.",
        "category": "inventory",
        "maxRows": 500,
        "parameters": {
            "department": {"type": "string", "required": True, "description": "STMAST DEPT value"},
            "negativeOnly": {"type": "boolean", "required": False, "default": False},
            "limit": {"type": "integer", "required": False, "default": 100, "max": 500},
        },
    },
    "sales.top_products": {
        "title": "Top products",
        "description": "Top-selling SKUs between two dates from Positill invoice lines.",
        "category": "sales",
        "maxRows": 100,
        "parameters": {
            "startDate": {"type": "date", "required": True, "description": "Inclusive start date (YYYY-MM-DD, SAST)"},
            "endDate": {"type": "date", "required": True, "description": "Inclusive end date (YYYY-MM-DD, SAST)"},
            "sortBy": {"type": "enum", "required": False, "default": "revenue", "enum": ["revenue", "units"]},
            "limit": {"type": "integer", "required": False, "default": 25, "max": 100},
        },
    },
    "sales.product_monthly": {
        "title": "Product monthly sales",
        "description": "Monthly unit sales and value for one SKU.",
        "category": "sales",
        "maxRows": 36,
        "parameters": {
            "sku": {"type": "string", "required": True, "description": "Proto SKU / item code"},
            "months": {"type": "integer", "required": False, "default": 12, "max": 36},
        },
    },
    "sales.invoice_lines": {
        "title": "Invoice lines",
        "description": "Positill invoice detail lines for a SKU over a date window.",
        "category": "sales",
        "maxRows": 500,
        "parameters": {
            "sku": {"type": "string", "required": True, "description": "Proto SKU / item code"},
            "days": {"type": "integer", "required": False, "default": 30, "max": 366},
            "limit": {"type": "integer", "required": False, "default": 200, "max": 500},
        },
    },
}


class ReportValidationError(ValueError):
    pass


def list_reports() -> list[dict[str, Any]]:
    return [
        {
            "id": report_id,
            "title": spec["title"],
            "description": spec["description"],
            "category": spec["category"],
            "maxRows": spec["maxRows"],
            "parameters": spec["parameters"],
        }
        for report_id, spec in REPORT_CATALOGUE.items()
    ]


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on"}:
        return True
    if text in {"0", "false", "no", "off", ""}:
        return False
    raise ReportValidationError(f"Invalid boolean value: {value!r}")


def _parse_int(name: str, value: Any, default: int, maximum: int) -> int:
    if value is None or value == "":
        parsed = default
    else:
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ReportValidationError(f'Param "{name}" must be an integer') from exc
    if parsed < 1:
        raise ReportValidationError(f'Param "{name}" must be at least 1')
    return min(parsed, maximum)


def _normalize_sku(value: Any, name: str = "sku") -> str:
    sku = str(value or "").strip().upper()
    if not sku or not SKU_RE.match(sku):
        raise ReportValidationError(f'Param "{name}" must be a valid SKU code')
    return sku


def _parse_date(name: str, value: Any) -> datetime:
    text = str(value or "").strip()
    if not ISO_DATE_RE.match(text):
        raise ReportValidationError(f'Param "{name}" must be YYYY-MM-DD')
    year, month, day = (int(part) for part in text.split("-"))
    return datetime(year, month, day, tzinfo=SAST).astimezone(timezone.utc)


def _sast_day_end(value: datetime) -> datetime:
    local = value.astimezone(SAST)
    next_day = datetime(
        local.year, local.month, local.day, tzinfo=SAST
    ) + timedelta(days=1)
    return next_day.astimezone(timezone.utc)


def validate_report_params(report_id: str, raw_params: Any) -> dict[str, Any]:
    if report_id not in REPORT_CATALOGUE:
        raise ReportValidationError(f"Unapproved report: {report_id}")

    spec = REPORT_CATALOGUE[report_id]
    schema = spec["parameters"]
    if raw_params is None:
        raw_params = {}
    if not isinstance(raw_params, dict):
        raise ReportValidationError("params must be an object")

    unknown = sorted(set(raw_params) - set(schema))
    if unknown:
        raise ReportValidationError(f"Unknown parameters: {', '.join(unknown)}")

    normalized: dict[str, Any] = {}
    for name, rule in schema.items():
        value = raw_params.get(name, rule.get("default"))
        if rule.get("required") and (value is None or value == ""):
            raise ReportValidationError(f'Missing required parameter: {name}')

        if value is None or value == "":
            continue

        param_type = rule.get("type", "string")
        if param_type == "string":
            normalized[name] = str(value).strip()
        elif param_type == "boolean":
            normalized[name] = _parse_bool(value)
        elif param_type == "integer":
            normalized[name] = _parse_int(name, value, rule.get("default", 1), rule.get("max", spec["maxRows"]))
        elif param_type == "date":
            normalized[name] = _parse_date(name, value)
        elif param_type == "enum":
            text = str(value).strip().lower()
            allowed = [str(item).lower() for item in rule.get("enum", [])]
            if text not in allowed:
                raise ReportValidationError(
                    f'Param "{name}" must be one of: {", ".join(rule.get("enum", []))}'
                )
            normalized[name] = text
        else:
            normalized[name] = value

    if report_id == "inventory.product_lookup":
        normalized["sku"] = _normalize_sku(normalized.get("sku"))
    if report_id == "inventory.stock_by_department":
        dept = str(normalized.get("department", "")).strip()
        if not dept or len(dept) > 64:
            raise ReportValidationError('Param "department" must be 1-64 characters')
        normalized["department"] = dept
        normalized["negativeOnly"] = normalized.get("negativeOnly", False)
        normalized["limit"] = _parse_int(
            "limit", normalized.get("limit"), schema["limit"]["default"], schema["limit"]["max"]
        )
    if report_id == "sales.top_products":
        start = normalized["startDate"]
        end = normalized["endDate"]
        if end < start:
            raise ReportValidationError("endDate must be on or after startDate")
        normalized["limit"] = _parse_int(
            "limit", normalized.get("limit"), schema["limit"]["default"], schema["limit"]["max"]
        )
        normalized["sortBy"] = normalized.get("sortBy", "revenue")
    if report_id == "sales.product_monthly":
        normalized["sku"] = _normalize_sku(normalized.get("sku"))
        normalized["months"] = _parse_int(
            "months", normalized.get("months"), schema["months"]["default"], schema["months"]["max"]
        )
    if report_id == "sales.invoice_lines":
        normalized["sku"] = _normalize_sku(normalized.get("sku"))
        normalized["days"] = _parse_int(
            "days", normalized.get("days"), schema["days"]["default"], schema["days"]["max"]
        )
        normalized["limit"] = _parse_int(
            "limit", normalized.get("limit"), schema["limit"]["default"], schema["limit"]["max"]
        )

    return normalized


def shift_month_start(value: datetime, months_back: int) -> datetime:
    local = value.astimezone(SAST)
    month_index = local.year * 12 + (local.month - 1) - months_back
    year, month_zero = divmod(month_index, 12)
    return datetime(year, month_zero + 1, 1, tzinfo=SAST).astimezone(timezone.utc)


def build_report_result(
    report_id: str,
    params: dict[str, Any],
    rows: list[dict[str, Any]],
    *,
    max_rows: int,
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    truncated = len(rows) > max_rows
    bounded = rows[:max_rows]
    return {
        "reportId": report_id,
        "parameters": params,
        "rows": bounded,
        "rowCount": len(bounded),
        "source": "POSWINSQL",
        "generatedAt": (generated_at or datetime.now(timezone.utc)).isoformat().replace("+00:00", "Z"),
        "readOnly": True,
        "meta": {
            "readOnly": True,
            "truncated": truncated,
            "maxRows": max_rows,
            "returnedRows": len(bounded),
        },
    }


def run_report(report_id: str, raw_params: Any, *, connect, row_to_dict) -> dict[str, Any]:
    params = validate_report_params(report_id, raw_params)
    spec = REPORT_CATALOGUE[report_id]
    runner: Callable[..., list[dict[str, Any]]] = {
        "inventory.product_lookup": _run_product_lookup,
        "inventory.stock_by_department": _run_stock_by_department,
        "sales.top_products": _run_top_products,
        "sales.product_monthly": _run_product_monthly,
        "sales.invoice_lines": _run_invoice_lines,
    }[report_id]
    rows = runner(params, connect=connect, row_to_dict=row_to_dict)
    return build_report_result(report_id, _public_params(params), rows, max_rows=spec["maxRows"])


def _public_params(params: dict[str, Any]) -> dict[str, Any]:
    public: dict[str, Any] = {}
    for key, value in params.items():
        if isinstance(value, datetime):
            public[key] = value.astimezone(SAST).strftime("%Y-%m-%d")
        else:
            public[key] = value
    return public


def _run_product_lookup(params: dict[str, Any], *, connect, row_to_dict) -> list[dict[str, Any]]:
    sql = """
        SELECT TOP 1 CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
        FROM dbo.STMAST
        WHERE CODE = ?
    """
    with connect(timeout=20) as conn:
        cur = conn.cursor()
        cur.execute(sql, params["sku"])
        row = cur.fetchone()
        if not row:
            return []
        cols = [col[0] for col in cur.description]
        item = row_to_dict(cols, row)
        onhand = float(item.get("ONHAND") or 0)
        booked = float(item.get("BOOKED") or 0)
        item["available"] = onhand - booked
        return [item]


def _run_stock_by_department(params: dict[str, Any], *, connect, row_to_dict) -> list[dict[str, Any]]:
    limit = int(params["limit"])
    sql = f"""
        SELECT TOP ({limit})
            CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT,
            (CAST(ONHAND AS float) - CAST(BOOKED AS float)) AS available
        FROM dbo.STMAST
        WHERE LTRIM(RTRIM(DEPT)) = ?
          {"AND (CAST(ONHAND AS float) - CAST(BOOKED AS float)) < 0" if params.get("negativeOnly") else ""}
        ORDER BY available ASC, CODE ASC
    """
    with connect(timeout=25) as conn:
        cur = conn.cursor()
        cur.execute(sql, params["department"])
        cols = [col[0] for col in cur.description]
        return [row_to_dict(cols, row) for row in cur.fetchall()]


def _run_top_products(params: dict[str, Any], *, connect, row_to_dict) -> list[dict[str, Any]]:
    start = params["startDate"]
    end_exclusive = _sast_day_end(params["endDate"])
    limit = int(params["limit"])
    order = "SUM(CAST(d.TOTAL AS float)) DESC" if params.get("sortBy", "revenue") == "revenue" else "SUM(CAST(d.QTY AS float)) DESC"
    sql = f"""
        SELECT TOP ({limit})
            d.PRODUCT AS sku,
            MAX(d.DESCR) AS description,
            SUM(CAST(d.QTY AS float)) AS units,
            SUM(CAST(d.TOTAL AS float)) AS revenue,
            COUNT(DISTINCT h.INV_NO) AS invoiceCount
        FROM dbo.DBINVDT d
        INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
        WHERE h.DATE >= ? AND h.DATE < ?
          AND d.PRODUCT IS NOT NULL AND LTRIM(RTRIM(d.PRODUCT)) <> ''
        GROUP BY d.PRODUCT
        ORDER BY {order}
    """
    with connect(timeout=30) as conn:
        cur = conn.cursor()
        cur.execute(sql, start, end_exclusive)
        cols = [col[0] for col in cur.description]
        return [row_to_dict(cols, row) for row in cur.fetchall()]


def _run_product_monthly(params: dict[str, Any], *, connect, row_to_dict) -> list[dict[str, Any]]:
    months = int(params["months"])
    now = datetime.now(timezone.utc)
    start = shift_month_start(now, months - 1)
    end = now
    sql = """
        SELECT
            CONVERT(char(7), h.DATE, 126) AS salesMonth,
            SUM(CAST(d.QTY AS float)) AS units,
            SUM(CAST(d.TOTAL AS float)) AS salesValue,
            COUNT(DISTINCT h.INV_NO) AS invoiceCount
        FROM dbo.DBINVDT d
        INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
        WHERE h.DATE >= ? AND h.DATE <= ?
          AND d.PRODUCT = ?
        GROUP BY CONVERT(char(7), h.DATE, 126)
        ORDER BY salesMonth
    """
    with connect(timeout=30) as conn:
        cur = conn.cursor()
        cur.execute(sql, start, end, params["sku"])
        cols = [col[0] for col in cur.description]
        return [row_to_dict(cols, row) for row in cur.fetchall()]


def _run_invoice_lines(params: dict[str, Any], *, connect, row_to_dict) -> list[dict[str, Any]]:
    limit = int(params["limit"])
    days = int(params["days"])
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    sql = f"""
        SELECT TOP ({limit})
            h.INV_NO AS invoiceNo,
            h.TYPE AS invoiceType,
            h.DATE AS invoiceDate,
            d.PRODUCT AS sku,
            d.DESCR AS description,
            CAST(d.QTY AS float) AS quantity,
            CAST(d.TOTAL AS float) AS lineTotal
        FROM dbo.DBINVDT d
        INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
        WHERE h.DATE >= ? AND h.DATE <= ?
          AND d.PRODUCT = ?
        ORDER BY h.DATE DESC, h.INV_NO DESC
    """
    with connect(timeout=30) as conn:
        cur = conn.cursor()
        cur.execute(sql, start, end, params["sku"])
        cols = [col[0] for col in cur.description]
        return [row_to_dict(cols, row) for row in cur.fetchall()]
