import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { fixImageFromUrl } from './_image-pipeline.js';

function getClient() {
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
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const sb = getClient();
  const { data: row, error: lookupError } = await sb
    .from('website_stock')
    .select('sku, title, category, subcategory_one, subcategory_two, original_description, image_url_one')
    .eq('sku', cleanSku)
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) {
    return res.status(404).json({ error: `Live product "${cleanSku}" not found — only catalogue products can be reprocessed` });
  }

  const sourceUrl = String(row.image_url_one || '').split(',')[0].trim();
  if (!sourceUrl) return res.status(400).json({ error: 'Product has no image to reprocess' });

  try {
    const t0 = Date.now();
    const { url: imageUrl, model, tokensIn, tokensOut } = await fixImageFromUrl(sourceUrl, { sku: cleanSku });

    const { error: updateError } = await sb
      .from('website_stock')
      .update({
        image_url_one: imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('sku', cleanSku);
    if (updateError) return res.status(400).json({ error: updateError.message });

    const { error: archiveError } = await sb.rpc('archive_product', { p_sku: cleanSku, p_by: 'new-products' });
    if (archiveError) return res.status(400).json({ error: archiveError.message });

    return res.status(200).json({
      ok: true,
      sku: cleanSku,
      title: row.title,
      imageUrl,
      sourceUrl,
      category: row.category,
      model,
      tokensIn,
      tokensOut,
      processingMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('reprocess-live-to-dormant:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Reprocess failed' });
  }
}
