import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { websiteSku } = req.body || {};
  const sku = String(websiteSku || '').trim();
  if (!sku) return res.status(400).json({ error: 'websiteSku is required' });

  const supabase = getStockAdminClient();

  const errors = [];
  const { error: liveError } = await supabase.from('website_stock').delete().eq('sku', sku);
  if (liveError) errors.push(liveError.message);
  const { error: archError } = await supabase.from('archived_products').delete().eq('sku', sku);
  if (archError) errors.push(archError.message);
  await supabase.from('staged_product_previews').delete().eq('sku', sku);

  if (errors.length) return res.status(400).json({ error: errors.join('; ') });

  return res.status(200).json({ ok: true, deletedSku: sku });
}
