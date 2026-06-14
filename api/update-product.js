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
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const {
    websiteSku,
    expectedUpdatedAt,
    image,
    description,
    title,
    name,
    price,
    category,
    subcategory_one,
    subcategory_two,
    subcategory_three,
    subcategory_four,
  } = req.body || {};
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
  if (title !== undefined) patch.title = String(title).trim();
  if (name !== undefined) patch.title = String(name).trim();
  if (price !== undefined) patch.price = Number(price) || 0;
  if (category !== undefined) patch.category = String(category).trim();
  if (subcategory_one !== undefined) patch.subcategory_one = String(subcategory_one).trim();
  if (subcategory_two !== undefined) patch.subcategory_two = subcategory_two ? String(subcategory_two).trim() : null;
  if (subcategory_three !== undefined) patch.subcategory_three = subcategory_three ? String(subcategory_three).trim() : null;
  if (subcategory_four !== undefined) patch.subcategory_four = subcategory_four ? String(subcategory_four).trim() : null;
  if (!Object.keys(patch).length) return res.status(200).json({ ok: true });

  patch.updated_at = new Date().toISOString();
  const supabase = getStockAdminClient();

  const { data: product, error: lookupError } = await supabase
    .from('website_stock')
    .select('sku, updated_at')
    .eq('sku', sku)
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (!product) return res.status(404).json({ error: 'Product not found' });

  if (expectedUpdatedAt && product.updated_at && product.updated_at !== expectedUpdatedAt) {
    return res.status(409).json({
      error: 'This product was changed by someone else — reload to see the latest.',
      currentUpdatedAt: product.updated_at,
    });
  }

  const { error } = await supabase.from('website_stock').update(patch).eq('sku', sku);
  if (error) return res.status(400).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
