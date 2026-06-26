import { createClient } from '@supabase/supabase-js';
import { findProductBySku, fetchProductLookupMap } from './_sku-match.js';

/**
 * Stock Supabase client for serverless API routes.
 * Uses STOCK_SUPABASE_POOLER_URL when set — this must be the HTTPS REST URL
 * (https://[ref].supabase.co), not a postgres:// pooler connection string.
 * PostgREST pools DB connections server-side; this env separates server routes
 * from the VITE_* client bundle URL.
 */
export function getStockClient() {
  const url = process.env.STOCK_SUPABASE_POOLER_URL
    || process.env.STOCK_SUPABASE_URL
    || process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.STOCK_SUPABASE_KEY
    || process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing stock Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function erpSkuFromLink(link) {
  if (!link) return null;
  return link.product_sku || link.barcode || null;
}

/** Build website_sku / barcode → ERP SKU maps from website_products. */
async function buildWebsiteProductLinkMaps(supabase, rows) {
  const linkByWebsiteSku = new Map();
  const erpSkuByBarcode = new Map();

  const websiteSkus = [...new Set(rows.map((r) => r.sku).filter(Boolean))];
  const barcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];

  const ingest = (links = []) => {
    for (const link of links) {
      const erp = erpSkuFromLink(link);
      if (!erp) continue;
      if (link.website_sku) linkByWebsiteSku.set(link.website_sku, erp);
      if (link.barcode) erpSkuByBarcode.set(link.barcode, erp);
    }
  };

  for (let i = 0; i < websiteSkus.length; i += 500) {
    const chunk = websiteSkus.slice(i, i + 500);
    const { data, error } = await supabase
      .from('website_products')
      .select('website_sku, product_sku, barcode')
      .in('website_sku', chunk);
    if (error) {
      if (/website_products/i.test(String(error.message || ''))) break;
      throw error;
    }
    ingest(data);
  }

  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await supabase
      .from('website_products')
      .select('website_sku, product_sku, barcode')
      .in('barcode', chunk);
    if (error) {
      if (/website_products/i.test(String(error.message || ''))) break;
      throw error;
    }
    ingest(data);
  }

  return { linkByWebsiteSku, erpSkuByBarcode };
}

function resolveErpSkuForRow(row, { linkByWebsiteSku, erpSkuByBarcode }) {
  return linkByWebsiteSku.get(row.sku)
    || erpSkuByBarcode.get(row.barcode)
    || row.barcode
    || row.sku
    || '';
}

function stockKeyForRow(row, linkByWebsiteSku) {
  return linkByWebsiteSku.get(row.sku) || row.barcode || row.sku || '';
}

/** Resolve ERP product SKU per website row (website_products, else barcode). */
export async function resolveProductSkusForRows(supabase, rows) {
  const { linkByWebsiteSku } = await buildWebsiteProductLinkMaps(supabase, rows);
  const rawKeys = rows.map((r) => stockKeyForRow(r, linkByWebsiteSku));
  const lookupMap = await fetchProductLookupMap(supabase, rawKeys, 'sku');
  return rows.map((r, i) => {
    const product = findProductBySku(lookupMap, rawKeys[i]);
    return product?.sku || rawKeys[i] || null;
  });
}

function liveStockFromProduct(product) {
  if (!product) return null;
  const available = product.available_stock;
  const raw = product.stock_qty;
  const hasAvailable = available !== null && available !== undefined && available !== '';
  const hasRaw = raw !== null && raw !== undefined && raw !== '';
  if (hasAvailable) return { stock_qty: raw ?? available, available_stock: available };
  if (hasRaw) return { stock_qty: raw, available_stock: raw };
  return { stock_qty: 0, available_stock: 0 };
}

/** Attach live SOH + price from public.products (website_products bridge + barcode). */
export async function enrichRowsWithProductStock(supabase, rows, { includePrice = false } = {}) {
  if (!rows.length) return rows;

  const linkMaps = await buildWebsiteProductLinkMaps(supabase, rows);

  const rawKeys = rows.map((r) => resolveErpSkuForRow(r, linkMaps));
  const cols = includePrice ? 'sku, stock_qty, available_stock, sell_price' : 'sku, stock_qty, available_stock';
  const lookupMap = await fetchProductLookupMap(supabase, rawKeys, cols);

  return rows.map((r, i) => {
    const product = findProductBySku(lookupMap, rawKeys[i]);
    const live = liveStockFromProduct(product);
    if (!live) {
      return {
        ...r,
        stock_qty: r.stock_qty ?? 0,
        available_stock: r.available_stock ?? r.stock_qty ?? 0,
      };
    }
    return {
      ...r,
      stock_qty: live.stock_qty,
      available_stock: live.available_stock,
      ...(includePrice ? { sell_price: product.sell_price } : {}),
      ...(includePrice && product.sell_price != null && !Number(r.price) ? { price: product.sell_price } : {}),
    };
  });
}
