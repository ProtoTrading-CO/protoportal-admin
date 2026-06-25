import { findProductBySku, fetchProductLookupMap } from './_sku-match.js';

function readNum(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Map a website_stock / archived_products / website_products row → products upsert payload. */
export function catalogueRowToProductPayload(row) {
  const sku = String(row.barcode || row.product_sku || row.sku || '').trim();
  if (!sku) return null;
  return {
    sku,
    description: String(row.original_description || row.description || row.title || sku).trim(),
    sell_price: readNum(row.sell_price ?? row.price, 0),
    stock_qty: readNum(row.stock_qty ?? row.available_stock, 0),
    available_stock: readNum(row.available_stock ?? row.stock_qty, 0),
    units_of_issue: String(row.units_of_issue || 'EACH').trim() || 'EACH',
    updated_at: new Date().toISOString(),
  };
}

/**
 * Ensure public.products has a row for this catalogue item (SOH source of truth).
 * Never overwrites an existing ERP row — only inserts when missing.
 */
export async function ensureProductFromCatalogueRow(supabase, row) {
  const payload = catalogueRowToProductPayload(row);
  if (!payload) return { ok: false, reason: 'missing_sku' };

  const lookup = await fetchProductLookupMap(supabase, [payload.sku], 'sku, sell_price, stock_qty, available_stock');
  const existing = findProductBySku(lookup, payload.sku);
  if (existing) return { ok: true, sku: existing.sku, created: false, existing: true };

  const { error } = await supabase.from('products').insert(payload);
  if (error) throw error;
  return { ok: true, sku: payload.sku, created: true, existing: false };
}

/** Pick the richest catalogue row per ERP barcode (live preferred over archive). */
export function groupCatalogueRowsByErpKey(rows, { preferLiveSkus = null } = {}) {
  const liveSet = preferLiveSkus instanceof Set ? preferLiveSkus : new Set();
  const byKey = new Map();

  for (const row of rows) {
    const key = String(row.barcode || row.product_sku || row.sku || '').trim();
    if (!key) continue;

    const score = (r) => {
      let s = 0;
      if (liveSet.has(r.sku)) s += 100;
      const soh = readNum(r.available_stock ?? r.stock_qty, -999999);
      s += soh;
      const price = readNum(r.price ?? r.sell_price, 0);
      if (price > 0) s += 10;
      if (r.original_description || r.description) s += 1;
      return s;
    };

    const prev = byKey.get(key);
    if (!prev || score(row) >= score(prev)) byKey.set(key, row);
  }

  return byKey;
}
