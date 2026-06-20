from pathlib import Path
import os

from product_image_intake import (
    DRY_RUN,
    build_insert_payload,
    build_storage_path,
    build_supabase_context,
    calculate_available_stock,
    calculate_sell_price,
    clean_text,
    create_product_in_supabase,
    decimal_to_float,
    get_product_from_sql,
    parse_filename,
    to_decimal,
    upload_product_image,
    validate_image_file,
    utc_now,
)


def storage_display_path(sku: str, image_number: str) -> str:
    path = build_storage_path(sku, image_number)
    try:
        from r2_storage import is_r2_configured
        if is_r2_configured():
            bucket = os.getenv("R2_BUCKET_NAME", "proto-images")
            return f"{bucket}/{path}"
    except ImportError:
        pass
    return path


IMAGE_COLUMNS = ["image_url_one", "image_url_two", "image_url_three", "image_url_four"]


def apply_image_to_website_stock(client, barcode: str, image_column: str, image_url: str) -> int:
    if not barcode or not image_column or not image_url:
        return 0
    rows = client.table("website_stock").select("sku").eq("barcode", barcode).execute()
    if not rows.data:
        return 0
    client.table("website_stock").update({
        image_column: image_url,
        "updated_at": utc_now(),
    }).eq("barcode", barcode).execute()
    return len(rows.data)


def image_column_for_slot(image_number: str) -> str:
    try:
        slot = max(1, min(4, int(image_number)))
    except (TypeError, ValueError):
        slot = 1
    return IMAGE_COLUMNS[slot - 1]


def preview_image_upload(filepath: str) -> dict:
    path = validate_image_file(filepath)
    sku, image_number = parse_filename(path.name)
    sql_row = get_product_from_sql(sku)
    if not sql_row:
        raise RuntimeError(f"SKU `{sku}` was not found in POSWINSQL.dbo.STMAST.")

    context = build_supabase_context()
    action = "upload_to_existing_product" if sku in context["sku_map"] else "create_product_then_upload"

    return {
        "sku": sku,
        "image_number": image_number,
        "description": clean_text(sql_row.get("DESCR")),
        "price": decimal_to_float(calculate_sell_price(sql_row.get("PRICE_A"))),
        "stock": decimal_to_float(to_decimal(sql_row.get("ONHAND"))),
        "available_stock": decimal_to_float(
            calculate_available_stock(sql_row.get("ONHAND"), sql_row.get("BOOKED"))
        ),
        "department": clean_text(sql_row.get("DEPT")),
        "action": action,
        "storage_path": storage_display_path(sku, image_number),
        "dry_run": DRY_RUN,
    }


def create_product_from_image(filepath: str) -> dict:
    path = validate_image_file(filepath)
    sku, image_number = parse_filename(path.name)
    sql_row = get_product_from_sql(sku)
    if not sql_row:
        raise RuntimeError(f"SKU `{sku}` was not found in POSWINSQL.dbo.STMAST.")

    context = build_supabase_context()
    client = context["client"]
    detected = context["detected_columns"]
    existing = context["sku_map"].get(sku)

    created_row = existing
    status = "existing_product_image_uploaded"
    if not existing:
        payload = build_insert_payload(sql_row, detected)
        if DRY_RUN:
            created_row = payload
            status = "dry_run_create_product_then_upload"
        else:
            created_row = create_product_in_supabase(payload, client=client)
            status = "product_created_and_image_uploaded"

    image_upload = {
        "bucket": None,
        "storage_path": build_storage_path(sku, image_number),
    }
    if not DRY_RUN:
        image_upload = upload_product_image(sku, image_number, path, client=client)
        public_url = image_upload.get("public_url") or image_upload["storage_path"]
        apply_image_to_website_stock(
            client,
            barcode=sku,
            image_column=image_column_for_slot(image_number),
            image_url=public_url,
        )

    product_id = None
    if created_row:
        product_id = created_row.get("id") or created_row.get(detected["sku"])

    return {
        "product_id": product_id,
        "image_path": image_upload.get("public_url") or image_upload["storage_path"],
        "status": status,
        "sku": sku,
        "image_number": image_number,
        "storage_backend": image_upload.get("backend"),
    }
