import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { batchValidateStockReady, mergeStagedImagesOntoLive } from './_stage-dormant.js';

function getClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function splitUrl(val) {
  return String(val || '').split(',')[0].trim() || null;
}

/** Staged image previews for live products awaiting Approval go-live. */
export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const sb = getClient();
  const { data: staged, error } = await sb
    .from('archived_products')
    .select('*')
    .eq('archived_by', 'new-products')
    .order('updated_at', { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  const skus = (staged || []).map((r) => r.sku).filter(Boolean);
  if (!skus.length) return res.status(200).json({ items: [] });

  const { data: liveRows } = await sb
    .from('website_stock')
    .select('sku, title, image_url_one, image_url_two, image_url_three, image_url_four, original_description, category, subcategory_one, subcategory_two, subcategory_three, subcategory_four, barcode')
    .in('sku', skus);

  const liveBySku = new Map((liveRows || []).map((r) => [r.sku, r]));

  // Batch stock validation — single query instead of N sequential queries
  const barcodes = (staged || []).map((r) => r.barcode || r.sku).filter(Boolean);
  const stockChecks = await batchValidateStockReady(sb, barcodes);

  const items = [];
  for (const row of staged || []) {
    const live = liveBySku.get(row.sku);
    if (!live) continue;

    const stockCheck = stockChecks.get(String(row.barcode || row.sku || '').trim()) || { ok: false, error: 'Missing barcode' };
    const { appliedSlots } = mergeStagedImagesOntoLive(row, live);
    if (!appliedSlots.length) continue;

    items.push({
      sku: row.sku,
      barcode: row.barcode,
      title: row.title || live.title,
      category: row.category,
      subcategories: [row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four].filter(Boolean),
      liveImages: [1, 2, 3, 4].map((s) => splitUrl(live[`image_url_${['one', 'two', 'three', 'four'][s - 1]}`])),
      stagedImages: [1, 2, 3, 4].map((s) => splitUrl(row[`image_url_${['one', 'two', 'three', 'four'][s - 1]}`])),
      changedSlots: appliedSlots,
      stockReady: stockCheck.ok,
      stockError: stockCheck.ok ? null : stockCheck.error,
      updatedAt: row.updated_at,
    });
  }

  return res.status(200).json({ items });
}
