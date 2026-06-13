import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { fixImageFromUrl, IMAGE_STYLES } from './_image-pipeline.js';
import { readSlotUrl, stageDormantSlotPreview } from './_stage-dormant.js';

const LIVE_SELECT = `
  id, sku, barcode, title, original_description,
  image_url_one, image_url_two, image_url_three, image_url_four,
  category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
  created_at, updated_at, price, stock_qty, available_stock, keep_live_when_oos
`;

function getClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function resolveStyle(imageStyle) {
  return Object.values(IMAGE_STYLES).includes(imageStyle) ? imageStyle : IMAGE_STYLES.shadow;
}

function firstSourceSlot(row) {
  for (let s = 1; s <= 4; s += 1) {
    if (readSlotUrl(row, s)) return s;
  }
  return 1;
}

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const {
    sku,
    prompt: userPrompt,
    imageStyle,
    targetSlot = 1,
    sourceSlot,
    referenceImageUrl,
  } = req.body || {};
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) return res.status(400).json({ error: 'sku is required' });

  const style = resolveStyle(imageStyle);
  const slot = Math.min(4, Math.max(1, Number(targetSlot) || 1));

  const sb = getClient();
  const { data: row, error: lookupError } = await sb
    .from('website_stock')
    .select(LIVE_SELECT)
    .eq('sku', cleanSku)
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!row) {
    return res.status(404).json({ error: `Live product "${cleanSku}" not found` });
  }

  const srcSlot = sourceSlot ? Math.min(4, Math.max(1, Number(sourceSlot))) : firstSourceSlot(row);
  const sourceUrl = readSlotUrl(row, srcSlot);
  if (!sourceUrl) return res.status(400).json({ error: 'Product has no source image to reprocess' });

  try {
    const t0 = Date.now();
    const { url: imageUrl, model, tokensIn, tokensOut } = await fixImageFromUrl(sourceUrl, {
      sku: cleanSku,
      imageStyle: style,
      userInstructions: userPrompt,
      productTitle: row.title,
      productDescription: row.original_description,
      referenceImageUrl: referenceImageUrl || undefined,
      targetSlot: slot,
    });

    const { stillLive } = await stageDormantSlotPreview(sb, row, { slot, imageUrl });

    return res.status(200).json({
      ok: true,
      sku: cleanSku,
      title: row.title,
      imageUrl,
      sourceUrl,
      sourceSlot: srcSlot,
      targetSlot: slot,
      category: row.category,
      stillLive,
      imageStyle: style,
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
