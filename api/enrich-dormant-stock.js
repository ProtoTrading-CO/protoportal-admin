import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function readStock(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Return price + SOH readiness for staged New Items SKUs. */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const skus = [...new Set(
    (Array.isArray(req.body?.skus) ? req.body.skus : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean),
  )];
  if (!skus.length) return res.status(400).json({ error: 'skus array is required' });

  const sb = getStockClient();
  const { data: stagedRows } = await sb
    .from('archived_products')
    .select('sku, barcode')
    .in('sku', skus)
    .eq('archived_by', 'new-products');

  const barcodeBySku = new Map((stagedRows || []).map((r) => [r.sku, r.barcode || r.sku]));
  const barcodes = [...new Set([...barcodeBySku.values()])];

  const stockByBarcode = new Map();
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data } = await sb.from('products').select('sku, sell_price, available_stock, stock_qty').in('sku', chunk);
    for (const p of data || []) stockByBarcode.set(p.sku, p);
  }

  const items = skus.map((sku) => {
    const barcode = barcodeBySku.get(sku) || sku;
    const p = stockByBarcode.get(barcode);
    const price = readStock(p?.sell_price);
    const soh = readStock(p?.available_stock) ?? readStock(p?.stock_qty);
    const ready = price !== null && price > 0 && soh !== null;
    let error = null;
    if (!p) error = 'No stock record';
    else if (price === null || price <= 0) error = 'Missing price';
    else if (soh === null) error = 'Missing SOH';
    return { sku, barcode, price, soh, ready, error };
  });

  return res.status(200).json({ items });
}
