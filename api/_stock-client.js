import { createClient } from '@supabase/supabase-js';

/** Stock Supabase client — prefers transaction pooler URL under load. */
export function getStockClient() {
  const url = process.env.STOCK_SUPABASE_POOLER_URL
    || process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing stock Supabase env vars');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Attach live SOH + price from public.products (join: products.sku = row.barcode). */
export async function enrichRowsWithProductStock(supabase, rows, { includePrice = false } = {}) {
  const barcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];
  if (!barcodes.length) return rows;
  const stockByBarcode = new Map();
  const cols = includePrice ? 'sku, stock_qty, available_stock, sell_price' : 'sku, stock_qty, available_stock';
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await supabase.from('products').select(cols).in('sku', chunk);
    if (error) throw error;
    for (const p of data || []) stockByBarcode.set(p.sku, p);
  }
  return rows.map((r) => {
    const p = stockByBarcode.get(r.barcode);
    if (!p) return r;
    return {
      ...r,
      stock_qty: p.stock_qty,
      available_stock: p.available_stock,
      ...(includePrice ? { sell_price: p.sell_price } : {}),
    };
  });
}
