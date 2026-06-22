import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const {
    code,
    title,
    price,
    imageUrl,
    imageSlot = 1,
    imageSource = 'upload',
    overwriteImage = false,
    category,
    subcategoryOne,
    subcategoryTwo,
    description,
    publishedBy,
    publishMode = 'direct',
    categoryConfidence,
  } = req.body || {};

  const sku = String(code || '').trim().toUpperCase();
  if (!sku) return res.status(400).json({ error: 'code is required' });
  if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });
  if (!category) return res.status(400).json({ error: 'category is required' });

  const slot = Math.min(4, Math.max(1, Number(imageSlot) || 1));
  const imageField = SLOT_FIELDS[slot - 1];

  const sb = getStockClient();

  const { data: existing, error: lookupErr } = await sb
    .from('website_stock')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();

  if (lookupErr) return res.status(400).json({ error: lookupErr.message });

  if (existing?.[imageField] && !overwriteImage) {
    return res.status(409).json({
      error: `Image slot ${slot} already has an image. Confirm overwrite to replace it.`,
      code: 'image_exists',
    });
  }

  const now = new Date().toISOString();

  const patch = {
    title: String(title || sku).trim(),
    price: Number(price) || 0,
    category: String(category || '').trim(),
    subcategory_one: String(subcategoryOne || category || '').trim(),
    subcategory_two: subcategoryTwo ? String(subcategoryTwo).trim() : null,
    [imageField]: String(imageUrl).trim(),
    updated_at: now,
  };

  if (description) patch.original_description = String(description).trim();

  let action;
  let writeError;

  if (existing) {
    action = 'update';
    const { error } = await sb.from('website_stock').update(patch).eq('sku', sku);
    writeError = error;
  } else {
    action = 'create';
    const insertRow = {
      sku,
      barcode: sku,
      title: patch.title,
      price: patch.price,
      category: patch.category,
      subcategory_one: patch.subcategory_one,
      subcategory_two: patch.subcategory_two || null,
      original_description: patch.original_description || patch.title,
      image_url_one: null,
      image_url_two: null,
      image_url_three: null,
      image_url_four: null,
      [imageField]: String(imageUrl).trim(),
      updated_at: now,
    };
    const { error } = await sb.from('website_stock').insert(insertRow);
    writeError = error;
  }

  if (writeError) return res.status(400).json({ error: writeError.message });

  await sb.from('product_publish_audit').insert({
    sku,
    action,
    source: 'manual_product_loader',
    publish_mode: String(publishMode || 'direct'),
    image_slot: slot,
    image_source: String(imageSource || 'upload'),
    category_confidence: categoryConfidence != null ? Number(categoryConfidence) : null,
    old_values: existing
      ? {
        title: existing.title,
        price: existing.price,
        category: existing.category,
        subcategory_one: existing.subcategory_one,
        [imageField]: existing[imageField],
      }
      : null,
    new_values: {
      title: patch.title,
      price: patch.price,
      category: patch.category,
      subcategoryOne: patch.subcategory_one,
      imageUrl,
      imageSlot: slot,
      imageSource,
      publishMode,
    },
    published_by: String(publishedBy || '').trim() || null,
    published_at: now,
  }).catch((err) => console.error('product_publish_audit insert failed:', err?.message));

  return res.status(200).json({ ok: true, action, sku });
}
