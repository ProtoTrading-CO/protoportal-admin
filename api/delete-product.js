import { createClient } from '@supabase/supabase-js';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { websiteSku } = req.body || {};
  if (!websiteSku) return res.status(400).json({ error: 'websiteSku is required' });

  const supabase = getStockAdminClient();

  const { error: wpError } = await supabase
    .from('website_products')
    .delete()
    .eq('website_sku', String(websiteSku));

  if (wpError) return res.status(400).json({ error: wpError.message });

  // Also remove from stock table if present (non-fatal if missing)
  await supabase.from('products').delete().eq('sku', String(websiteSku));

  return res.status(200).json({ ok: true });
}
