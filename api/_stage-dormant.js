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
export async function stageDormantPreview(sb, liveRow, processedImageUrl) {
  const sku = String(liveRow.sku || '').trim();
  if (!sku) throw new Error('Missing SKU');

  const now = new Date().toISOString();
  const payload = {
    sku,
    barcode: liveRow.barcode,
    title: liveRow.title,
    original_description: liveRow.original_description,
    image_url_one: processedImageUrl,
    image_url_two: liveRow.image_url_two,
    image_url_three: liveRow.image_url_three,
    image_url_four: liveRow.image_url_four,
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

  const { data: existing } = await sb
    .from('archived_products')
    .select('sku, archived_by')
    .eq('sku', sku)
    .maybeSingle();

  if (existing && existing.archived_by !== 'new-products') {
    throw new Error(`SKU "${sku}" is archived as "${existing.archived_by}" — cannot stage New Products preview`);
  }

  if (existing) {
    const { error } = await sb.from('archived_products').update(payload).eq('sku', sku);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('archived_products').insert({ ...payload, id: liveRow.id });
    if (error) throw new Error(error.message);
  }

  const { data: stillLive } = await sb.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
  return { stillLive: !!stillLive };
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

  const { error: unarchiveErr } = await sb.rpc('unarchive_product', { p_sku: cleanSku });
  if (unarchiveErr) throw new Error(unarchiveErr.message);
  return { mode: 'unarchived', sku: cleanSku, imageUrl: staged.image_url_one };
}
