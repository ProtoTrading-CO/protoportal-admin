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

  const { websiteSku, image, description } = req.body || {};
  if (!websiteSku) return res.status(400).json({ error: 'websiteSku is required' });

  const sku = String(websiteSku).trim();
  const patch = {};
  if (image !== undefined) {
    const images = String(image).split(',').map((url) => url.trim()).filter(Boolean);
    patch.image_url_one = images[0] || null;
    patch.image_url_two = images[1] || null;
    patch.image_url_three = images[2] || null;
    patch.image_url_four = images[3] || null;
  }
  if (description !== undefined) patch.original_description = String(description).trim();
  if (!Object.keys(patch).length) return res.status(200).json({ ok: true });

  patch.updated_at = new Date().toISOString();
  const supabase = getStockAdminClient();

  const { data: product, error: lookupError } = await supabase
    .from('website_stock')
    .select('sku')
    .eq('sku', sku)
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { error } = await supabase.from('website_stock').update(patch).eq('sku', sku);
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
