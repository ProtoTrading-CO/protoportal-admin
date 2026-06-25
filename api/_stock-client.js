import { createClient } from '@supabase/supabase-js';

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

/** Resolve ERP product SKU per website row (website_products, else barcode). */
export async function resolveProductSkusForRows(supabase, rows) {
  const websiteSkus = [...new Set(rows.map((r) => r.sku).filter(Boolean))];
  const productSkuByWebsiteSku = new Map();
  if (websiteSkus.length) {
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
      for (const l of data || []) {
        const sku = l.product_sku || l.barcode || null;
        if (sku) productSkuByWebsiteSku.set(l.website_sku, sku);
      }
    }
  }
  return rows.map((r) => productSkuByWebsiteSku.get(r.sku) || r.barcode || null);
}

/** Attach live SOH + price from public.products via website_products (fallback: barcode). */
export async function enrichRowsWithProductStock(supabase, rows, { includePrice = false } = {}) {
  const resolved = await resolveProductSkusForRows(supabase, rows);
  const productSkus = [...new Set(resolved)].filter(Boolean);
  if (!productSkus.length) return rows;
  const stockBySku = new Map();
  const cols = includePrice ? 'sku, stock_qty, available_stock, sell_price' : 'sku, stock_qty, available_stock';
  for (let i = 0; i < productSkus.length; i += 500) {
    const chunk = productSkus.slice(i, i + 500);
    const { data, error } = await supabase.from('products').select(cols).in('sku', chunk);
    if (error) throw error;
    for (const p of data || []) stockBySku.set(p.sku, p);
  }
  return rows.map((r, i) => {
    const p = stockBySku.get(resolved[i]);
    if (!p) return r;
    return {
      ...r,
      stock_qty: p.stock_qty,
      available_stock: p.available_stock,
      ...(includePrice ? { sell_price: p.sell_price } : {}),
    };
  });
}
