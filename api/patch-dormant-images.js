import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

const SLOT_FIELDS = {
  1: 'image_url_one',
  2: 'image_url_two',
  3: 'image_url_three',
  4: 'image_url_four',
};

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/** Patch image URLs on a staged New Items row after folder upload. */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku, images = {} } = req.body || {};
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const patch = {};
  for (const [slot, url] of Object.entries(images)) {
    const field = SLOT_FIELDS[Number(slot)];
    if (field && url) patch[field] = String(url).trim();
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No image URLs provided' });

  const sb = getStockClient();
  const { data: row } = await sb
    .from('archived_products')
    .select('sku')
    .eq('sku', cleanSku)
    .eq('archived_by', 'new-products')
    .maybeSingle();
  if (!row) return res.status(404).json({ error: `No New Items row for "${cleanSku}"` });

  const { error } = await sb
    .from('archived_products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('sku', cleanSku)
    .eq('archived_by', 'new-products');
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ok: true, sku: cleanSku, patched: Object.keys(patch) });
}
