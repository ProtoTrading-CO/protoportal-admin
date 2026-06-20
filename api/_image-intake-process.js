/**
 * Image intake — ports George's product_image_intake.py / image_intake_service.py
 *
 * When IMAGE_INTAKE_SERVICE_URL is set, proxies to office-machine HTTP API.
 * Otherwise uses Supabase + SQL bridge with the same business rules.
 */

import { LIVE_BUCKET, parseIntakeFilename, storageObjectPath } from './_image-intake-utils.js';
import {
  fetchStmastRow,
  isStmastAccessConfigured,
  sqlRowToPreview,
  stmastSetupMessage,
} from './_sql-stmast.js';
import { isR2Configured, r2StorageLabel, uploadToR2 } from './_r2-storage.js';

const SKU_COLUMNS = ['sku', 'product_sku', 'product_code', 'code'];
const DESC_COLUMNS = ['description', 'title', 'name'];
const PRICE_COLUMNS = ['sell_price', 'selling_price', 'price', 'website_price', 'price_a'];
const STOCK_COLUMNS = ['stock_qty', 'stock_quantity', 'quantity', 'qty', 'onhand'];
const AVAIL_COLUMNS = ['available_stock', 'available_qty', 'stock_available'];

function serviceBase() {
  return String(process.env.IMAGE_INTAKE_SERVICE_URL || '').trim().replace(/\/$/, '');
}

function serviceKey() {
  return String(process.env.IMAGE_INTAKE_SERVICE_KEY || process.env.STOCK_SQL_BRIDGE_KEY || '').trim();
}

async function callIntakeService(path, { filename, contentType, base64 }) {
  const base = serviceBase();
  if (!base) return null;

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = serviceKey();
  if (key) headers['x-api-key'] = key;

  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ filename, contentType, base64 }),
    signal: AbortSignal.timeout(120000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `Image intake service failed (${res.status})`);
  }
  return json;
}

function detectColumn(columns, candidates) {
  const lookup = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const candidate of candidates) {
    const found = lookup.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

async function detectProductColumns(supabase) {
  const { data, error } = await supabase.from('products').select('*').limit(1);
  if (error) throw error;
  const row = data?.[0] || {};
  const available = Object.keys(row);
  const detected = {
    sku: detectColumn(available, SKU_COLUMNS),
    description: detectColumn(available, DESC_COLUMNS),
    price: detectColumn(available, PRICE_COLUMNS),
    stock: detectColumn(available, STOCK_COLUMNS),
    available_stock: detectColumn(available, AVAIL_COLUMNS),
    updated_at: detectColumn(available, ['updated_at', 'modified_at', 'last_updated']),
    created_at: detectColumn(available, ['created_at']),
  };
  for (const [name, col] of Object.entries(detected)) {
    if (!col && ['sku', 'description', 'price', 'stock', 'available_stock'].includes(name)) {
      throw new Error(`Could not detect products.${name} column`);
    }
  }
  return detected;
}

function toDecimal(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** PRICE_A * 1.15 rounded to nearest 0.50 — matches George's calculate_sell_price */
function calculateSellPrice(priceA) {
  const vatInclusive = toDecimal(priceA) * 1.15;
  return Math.round(vatInclusive * 2) / 2;
}

function buildInsertPayload(sqlRow, detected) {
  const onhand = toDecimal(sqlRow.ONHAND);
  const booked = toDecimal(sqlRow.BOOKED);
  const now = new Date().toISOString();
  const payload = {
    [detected.sku]: String(sqlRow.CODE || '').trim(),
    [detected.description]: String(sqlRow.DESCR || '').trim(),
    [detected.price]: calculateSellPrice(sqlRow.PRICE_A),
    [detected.stock]: onhand,
    [detected.available_stock]: onhand - booked,
  };
  if (detected.created_at) payload[detected.created_at] = now;
  if (detected.updated_at) payload[detected.updated_at] = now;
  return payload;
}

async function productExists(supabase, sku, skuColumn = 'sku') {
  const { data, error } = await supabase.from('products').select(skuColumn).eq(skuColumn, sku).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function uploadLiveImage(supabase, { buffer, contentType, sku, imageNumber }) {
  const objectPath = storageObjectPath(sku, imageNumber);

  if (isR2Configured()) {
    const { publicUrl, objectKey } = await uploadToR2({
      buffer,
      contentType,
      objectKey: objectPath,
    });
    return {
      objectPath: objectKey,
      imageUrl: publicUrl,
      storagePath: r2StorageLabel(objectKey),
      storageBackend: 'r2',
    };
  }

  await supabase.storage.createBucket(LIVE_BUCKET, { public: true }).catch(() => {});
  const { error } = await supabase.storage.from(LIVE_BUCKET).upload(objectPath, buffer, {
    contentType: contentType || 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(LIVE_BUCKET).getPublicUrl(objectPath);
  return {
    objectPath,
    imageUrl: publicUrl,
    storagePath: `${LIVE_BUCKET}/${objectPath}`,
    storageBackend: 'supabase',
  };
}

async function applyImageToWebsiteStock(supabase, { barcode, imageColumn, imageUrl }) {
  if (!barcode || !imageColumn || !imageUrl) return 0;
  const { data, error: readErr } = await supabase
    .from('website_stock')
    .select('sku')
    .eq('barcode', barcode);
  if (readErr) throw readErr;
  if (!data?.length) return 0;

  const { error } = await supabase
    .from('website_stock')
    .update({ [imageColumn]: imageUrl, updated_at: new Date().toISOString() })
    .eq('barcode', barcode);
  if (error) throw error;
  return data.length;
}

function previewStoragePath(sku, imageNumber) {
  const objectPath = storageObjectPath(sku, imageNumber);
  if (isR2Configured()) return r2StorageLabel(objectPath);
  return `${LIVE_BUCKET}/${objectPath}`;
}

export async function buildIntakePreview(supabase, filename, { contentType = '', base64 = '' } = {}) {
  if (serviceBase() && base64) {
    const remote = await callIntakeService('/preview', { filename, contentType, base64 });
    const p = remote.preview;
    const { imageNumber, imageColumn } = parseIntakeFilename(filename);
    return {
      filename,
      sourceSku: p.sku,
      imageNumber,
      imageColumn,
      storagePath: previewStoragePath(p.sku, imageNumber),
      sql: {
        code: p.sku,
        title: p.description,
        price: p.price,
        onhand: p.stock,
        available: p.available_stock,
        dept: p.department,
      },
      sqlFound: true,
      productExists: p.action === 'upload_to_existing_product',
      action: p.action,
      canProcess: true,
      dryRun: p.dry_run,
      blockedReason: null,
      viaService: true,
    };
  }

  const { sourceSku, imageNumber, imageColumn } = parseIntakeFilename(filename);
  if (!sourceSku) throw new Error('Could not parse SKU from filename');

  const exists = await productExists(supabase, sourceSku);
  let sqlRow = null;
  let sqlLookupError = null;

  if (isStmastAccessConfigured()) {
    try {
      sqlRow = await fetchStmastRow(sourceSku);
    } catch (err) {
      sqlLookupError = err.message || String(err);
    }
  }

  if (sqlRow) {
    const action = exists ? 'upload_to_existing_product' : 'create_product_then_upload';
    return {
      filename,
      sourceSku,
      imageNumber,
      imageColumn,
      storagePath: previewStoragePath(sourceSku, imageNumber),
      sql: sqlRowToPreview(sqlRow),
      sqlFound: true,
      productExists: exists,
      action,
      canProcess: true,
      blockedReason: null,
      viaService: false,
    };
  }

  if (exists) {
    return {
      filename,
      sourceSku,
      imageNumber,
      imageColumn,
      storagePath: previewStoragePath(sourceSku, imageNumber),
      sql: null,
      sqlFound: false,
      productExists: true,
      action: 'upload_to_existing_product',
      canProcess: true,
      blockedReason: null,
      uploadOnlyWithoutSql: true,
      sqlWarning: sqlLookupError || stmastSetupMessage(),
      viaService: false,
    };
  }

  const blockedReason = sqlLookupError
    || (isStmastAccessConfigured()
      ? `SKU ${sourceSku} not found in POSWINSQL.dbo.STMAST`
      : stmastSetupMessage());

  return {
    filename,
    sourceSku,
    imageNumber,
    imageColumn,
    storagePath: previewStoragePath(sourceSku, imageNumber),
    sql: null,
    sqlFound: false,
    productExists: false,
    action: 'create_product_then_upload',
    canProcess: false,
    blockedReason,
    viaService: false,
  };
}

export async function processIntakeImage(supabase, { filename, contentType, base64, dryRun = false }) {
  if (serviceBase()) {
    if (dryRun) {
      const preview = await callIntakeService('/preview', { filename, contentType, base64 });
      return {
        ok: true,
        status: 'dry_run',
        dryRun: true,
        ...preview.preview,
        message: `DRY RUN via office service — ${preview.preview?.action}`,
        viaService: true,
      };
    }
    const result = await callIntakeService('/process', { filename, contentType, base64 });
    const { imageNumber, imageColumn } = parseIntakeFilename(filename);
    let websiteRowsUpdated = 0;
    if (result.image_path && result.sku) {
      websiteRowsUpdated = await applyImageToWebsiteStock(supabase, {
        barcode: result.sku,
        imageColumn,
        imageUrl: result.image_path,
      });
    }
    return {
      ok: true,
      status: result.status || 'completed',
      sourceSku: result.sku,
      imageNumber: Number(result.image_number) || imageNumber,
      imageUrl: result.image_path,
      productId: result.product_id,
      storageBackend: result.storage_backend || 'service',
      websiteRowsUpdated,
      message: result.status,
      viaService: true,
    };
  }

  const preview = await buildIntakePreview(supabase, filename);
  if (!preview.canProcess) {
    return { ok: false, status: 'failed', ...preview, message: preview.blockedReason };
  }

  if (dryRun) {
    return {
      ok: true,
      status: 'dry_run',
      dryRun: true,
      ...preview,
      message: `DRY RUN: ${preview.action} → ${preview.storagePath}`,
    };
  }

  const buffer = Buffer.from(base64, 'base64');

  if (!preview.productExists) {
    const sqlRow = await fetchStmastRow(preview.sourceSku);
    if (!sqlRow) {
      throw new Error(`SKU ${preview.sourceSku} not found in POSWINSQL.dbo.STMAST`);
    }
    const detected = await detectProductColumns(supabase);
    const payload = buildInsertPayload(sqlRow, detected);
    const { error } = await supabase.from('products').insert(payload);
    if (error) throw error;
  }

  const { objectPath, imageUrl, storagePath, storageBackend } = await uploadLiveImage(supabase, {
    buffer,
    contentType,
    sku: preview.sourceSku,
    imageNumber: preview.imageNumber,
  });

  const websiteRowsUpdated = await applyImageToWebsiteStock(supabase, {
    barcode: preview.sourceSku,
    imageColumn: preview.imageColumn,
    imageUrl,
  });

  return {
    ok: true,
    status: preview.productExists ? 'existing_product_image_uploaded' : 'product_created_and_image_uploaded',
    ...preview,
    productAction: preview.productExists ? 'upload_only' : 'created',
    imageUrl,
    objectPath: storagePath,
    storageBackend,
    websiteRowsUpdated,
    message: `${preview.productExists ? 'Uploaded' : 'Created product + uploaded'} ${preview.sourceSku} → ${storagePath}${websiteRowsUpdated ? ` (${websiteRowsUpdated} catalogue row(s) updated)` : ''}`,
  };
}
