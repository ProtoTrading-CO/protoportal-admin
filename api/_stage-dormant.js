/** Stage a processed image in New Products without removing the live catalogue row. */

const LIVE_SELECT = `
  id, sku, barcode, title, original_description,
  image_url_one, image_url_two, image_url_three, image_url_four,
  category, subcategory_one, subcategory_two, subcategory_three, subcategory_four,
  created_at, updated_at, price, stock_qty, available_stock, keep_live_when_oos
`;

/**
 * Upsert archived_products preview (archived_by = new-products) while website_stock stays live.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
function slotField(slot) {
  const map = { 1: 'image_url_one', 2: 'image_url_two', 3: 'image_url_three', 4: 'image_url_four' };
  return map[slot] || 'image_url_one';
}

function readSlotUrl(row, slot) {
  const field = slotField(slot);
  return String(row?.[field] || '').split(',')[0].trim();
}

export async function stageDormantSlotPreview(sb, liveRow, { slot = 1, imageUrl, mergeFromStaged = true } = {}) {
  const sku = String(liveRow.sku || '').trim();
  if (!sku) throw new Error('Missing SKU');
  const targetSlot = Math.min(4, Math.max(1, Number(slot) || 1));
  const processedImageUrl = String(imageUrl || '').trim();
  if (!processedImageUrl) throw new Error('Missing image URL');

  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from('archived_products')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();

  if (existing && existing.archived_by !== 'new-products') {
    throw new Error(`SKU "${sku}" is archived as "${existing.archived_by}" — cannot stage preview`);
  }

  const base = existing && mergeFromStaged ? existing : liveRow;
  const payload = {
    sku,
    barcode: liveRow.barcode,
    title: liveRow.title,
    original_description: liveRow.original_description,
    image_url_one: base.image_url_one ?? liveRow.image_url_one,
    image_url_two: base.image_url_two ?? liveRow.image_url_two,
    image_url_three: base.image_url_three ?? liveRow.image_url_three,
    image_url_four: base.image_url_four ?? liveRow.image_url_four,
    category: liveRow.category,
    subcategory_one: liveRow.subcategory_one,
    subcategory_two: liveRow.subcategory_two,
    subcategory_three: liveRow.subcategory_three,
    subcategory_four: liveRow.subcategory_four,
    created_at: liveRow.created_at || now,
    updated_at: now,
    price: liveRow.price ?? null,
    stock_qty: liveRow.stock_qty ?? null,
    available_stock: liveRow.available_stock ?? null,
    keep_live_when_oos: liveRow.keep_live_when_oos ?? false,
    archived_at: now,
    archived_by: 'new-products',
  };
  payload[slotField(targetSlot)] = processedImageUrl;

  if (existing) {
    const patch = {
      updated_at: now,
      [slotField(targetSlot)]: processedImageUrl,
    };
    const { error } = await sb.from('archived_products').update(patch).eq('sku', sku);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('archived_products').insert({ ...payload, id: liveRow.id });
    if (error) throw new Error(error.message);
  }

  const { data: stillLive } = await sb.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
  return { stillLive: !!stillLive, slot: targetSlot, imageUrl: processedImageUrl };
}

export async function stageDormantPreview(sb, liveRow, processedImageUrl) {
  return stageDormantSlotPreview(sb, liveRow, { slot: 1, imageUrl: processedImageUrl });
}

export { readSlotUrl, slotField };

function readStock(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Require price + SOH from source-of-truth products table (join: products.sku = barcode). */
export async function validateStockReady(sb, barcode) {
  const key = String(barcode || '').trim();
  if (!key) return { ok: false, error: 'Missing barcode/SKU for stock lookup' };

  const { data: product, error } = await sb
    .from('products')
    .select('sku, sell_price, available_stock, stock_qty')
    .eq('sku', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) return { ok: false, error: `No stock record for "${key}" — add price and SOH in the stock system first` };

  const price = readStock(product.sell_price);
  if (price === null || price <= 0) {
    return { ok: false, error: `Missing or zero price for "${key}" in stock system` };
  }

  const soh = readStock(product.available_stock) ?? readStock(product.stock_qty);
  if (soh === null) {
    return { ok: false, error: `Missing stock/SOH for "${key}" in stock system` };
  }

  return { ok: true, price, soh };
}

/** Apply staged New Products image to live site, or unarchive brand-new dormant SKUs. */
export async function applyDormantToLive(sb, sku) {
  const cleanSku = String(sku || '').trim();
  if (!cleanSku) throw new Error('sku is required');

  const { data: staged, error: stagedErr } = await sb
    .from('archived_products')
    .select('*')
    .eq('sku', cleanSku)
    .eq('archived_by', 'new-products')
    .maybeSingle();
  if (stagedErr) throw new Error(stagedErr.message);
  if (!staged) throw new Error(`No New Products preview for "${cleanSku}"`);

  const { data: live } = await sb.from('website_stock').select('sku').eq('sku', cleanSku).maybeSingle();

  if (live) {
    const { error: updateErr } = await sb
      .from('website_stock')
      .update({
        image_url_one: staged.image_url_one,
        image_url_two: staged.image_url_two,
        image_url_three: staged.image_url_three,
        image_url_four: staged.image_url_four,
        updated_at: new Date().toISOString(),
      })
      .eq('sku', cleanSku);
    if (updateErr) throw new Error(updateErr.message);

    const { error: delErr } = await sb
      .from('archived_products')
      .delete()
      .eq('sku', cleanSku)
      .eq('archived_by', 'new-products');
    if (delErr) throw new Error(delErr.message);

    return { mode: 'image_applied', sku: cleanSku, imageUrl: staged.image_url_one };
  }

  const stockCheck = await validateStockReady(sb, staged.barcode || cleanSku);
  if (!stockCheck.ok) throw new Error(stockCheck.error);

  const { error: unarchiveErr } = await sb.rpc('unarchive_product', { p_sku: cleanSku });
  if (unarchiveErr) throw new Error(unarchiveErr.message);
  return { mode: 'unarchived', sku: cleanSku, imageUrl: staged.image_url_one, price: stockCheck.price, soh: stockCheck.soh };
}
