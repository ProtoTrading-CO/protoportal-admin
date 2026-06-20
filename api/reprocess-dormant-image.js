import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { fixImageFromUrl, IMAGE_STYLES } from './_image-pipeline.js';

const SLOT_FIELDS = {
  1: 'image_url_one',
  2: 'image_url_two',
  3: 'image_url_three',
  4: 'image_url_four',
};

function getClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { sku, slot: slotRaw, prompt: userPrompt, imageStyle } = req.body || {};
  const cleanSku = String(sku || '').trim();
  const slot = Math.min(4, Math.max(1, Number(slotRaw) || 1));
  const field = SLOT_FIELDS[slot];
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const style = Object.values(IMAGE_STYLES).includes(imageStyle) ? imageStyle : IMAGE_STYLES.standard;
  const sb = getClient();

  const { data: row, error: lookupError } = await sb
    .from('archived_products')
    .select('*')
    .eq('sku', cleanSku)
    .eq('archived_by', 'new-products')
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) return res.status(404).json({ error: `No New Items staging row for "${cleanSku}"` });

  const sourceUrl = String(row[field] || row.image_url_one || '').split(',')[0].trim();
  if (!sourceUrl) return res.status(400).json({ error: `No image in slot ${slot} for "${cleanSku}"` });

  try {
    const { url: imageUrl, model, tokensIn, tokensOut } = await fixImageFromUrl(sourceUrl, {
      sku: cleanSku,
      imageStyle: style,
      userInstructions: userPrompt,
      productTitle: row.title,
    });

    const { error: updateErr } = await sb
      .from('archived_products')
      .update({ [field]: imageUrl, updated_at: new Date().toISOString() })
      .eq('sku', cleanSku)
      .eq('archived_by', 'new-products');
    if (updateErr) throw new Error(updateErr.message);

    return res.status(200).json({
      ok: true,
      sku: cleanSku,
      slot,
      imageUrl,
      sourceUrl,
      imageStyle: style,
      model,
      tokensIn,
      tokensOut,
    });
  } catch (err) {
    console.error('reprocess-dormant-image:', err?.message || err);
    return res.status(500).json({ error: err.message || 'Image generation failed' });
  }
}
