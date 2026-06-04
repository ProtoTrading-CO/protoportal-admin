import { createClient } from '@supabase/supabase-js';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function normalizeSku(value) {
  return String(value || '').trim().replace(/\.[^.]+$/, ''); // strip extension if present
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { websiteSku, title, imageUrl, category, description } = req.body || {};
  const sku = normalizeSku(websiteSku);
  const name = String(title || sku).trim();
  const image = String(imageUrl || '').trim();
  const cat = String(category || '').trim();

  if (!sku) return res.status(400).json({ error: 'websiteSku is required' });
  if (!image) return res.status(400).json({ error: 'imageUrl is required' });

  const supabase = getStockAdminClient();

  // Check for duplicates
  const { data: existing } = await supabase
    .from('website_products')
    .select('website_sku')
    .or(`website_sku.eq.${sku},barcode.eq.${sku}`)
    .limit(1);

  if (existing?.length) {
    return res.status(409).json({ error: `SKU "${sku}" already exists` });
  }

  const { data: sortRow } = await supabase
    .from('website_products')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = Number(sortRow?.sort_order || 0) + 1;

  const { error: wpError } = await supabase.from('website_products').insert({
    website_sku: sku,
    barcode: sku,
    parent_sku: sku,
    colour: '',
    title: name,
    category: cat || null,
    image_url: image,
    active: false,   // dormant until admin sets live
    description: String(description || '').trim(),
    sort_order: sortOrder,
  });

  if (wpError) return res.status(400).json({ error: wpError.message });

  // Stock row — 0 qty, admin will update when restocking
  await supabase.from('products').insert({
    sku,
    description: name,
    sell_price: 0,
    stock_qty: 0,
    yearly_sales: 0,
    supplier: '',
    available_stock: 0,
  }).catch(() => {}); // non-fatal if stock row already exists

  return res.status(200).json({ ok: true, websiteSku: sku });
}
