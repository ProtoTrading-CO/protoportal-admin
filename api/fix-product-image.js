import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { fixImageFromUrl } from './_image-pipeline.js';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku } = req.body || {};
  if (!sku) return res.status(400).json({ error: 'sku is required' });

  const supabase = getStockAdminClient();
  const { data: row, error: lookupError } = await supabase
    .from('website_stock')
    .select('sku, title, image_url_one')
    .eq('sku', String(sku).trim())
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) return res.status(404).json({ error: 'Product not found' });

  const imageUrl = String(row.image_url_one || '').split(',')[0].trim();
  if (!imageUrl) return res.status(400).json({ error: 'Product has no image to fix' });

  try {
    const t0 = Date.now();
    const { url: newUrl, model, tokensIn, tokensOut } = await fixImageFromUrl(imageUrl, { sku: row.sku });

    const { error: updateError } = await supabase
      .from('website_stock')
      .update({ image_url_one: newUrl, updated_at: new Date().toISOString() })
      .eq('sku', row.sku);
    if (updateError) return res.status(400).json({ error: updateError.message });

    return res.status(200).json({
      ok: true,
      sku: row.sku,
      title: row.title,
      imageUrl: newUrl,
      model,
      tokensIn,
      tokensOut,
      processingMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('fix-product-image:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Image fix failed' });
  }
}
