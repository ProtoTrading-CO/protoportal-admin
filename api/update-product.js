import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { resolveProductLoaderMatch } from './_product-loader-lookup.js';
import { ensureProductFromCatalogueRow } from './_ensure-product.js';
import { loadTaxonomy } from './_taxonomy-utils.js';
import { mottaroPathSnapshotForRow } from '../lib/mottaro-category.mjs';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const {
    websiteSku,
    expectedUpdatedAt,
    image,
    description,
    packDescription,
    title,
    name,
    price,
    category,
    subcategory_one,
    subcategory_two,
    subcategory_three,
    subcategory_four,
    barcode,
    code,
    newWebsiteSku,
  } = req.body || {};
  if (!websiteSku) return res.status(400).json({ error: 'websiteSku is required' });

  const sku = String(websiteSku).trim();
  const nextSku = newWebsiteSku ? String(newWebsiteSku).trim() : '';
  const patch = {};
  if (image !== undefined) {
    const images = String(image).split(',').map((url) => url.trim()).filter(Boolean);
    patch.image_url_one = images[0] || null;
    patch.image_url_two = images[1] || null;
    patch.image_url_three = images[2] || null;
    patch.image_url_four = images[3] || null;
  }
  if (barcode !== undefined) patch.barcode = String(barcode).trim();
  if (code !== undefined) patch.barcode = String(code).trim();
  if (description !== undefined) patch.original_description = String(description).trim();
  if (packDescription !== undefined) patch.pack_description = String(packDescription).trim();
  if (title !== undefined) patch.title = String(title).trim();
  if (name !== undefined) patch.title = String(name).trim();
  if (price !== undefined) patch.price = Number(price) || 0;
  if (category !== undefined) patch.category = String(category).trim();
  if (subcategory_one !== undefined) patch.subcategory_one = String(subcategory_one).trim();
  if (subcategory_two !== undefined) patch.subcategory_two = subcategory_two ? String(subcategory_two).trim() : null;
  if (subcategory_three !== undefined) patch.subcategory_three = subcategory_three ? String(subcategory_three).trim() : null;
  if (subcategory_four !== undefined) patch.subcategory_four = subcategory_four ? String(subcategory_four).trim() : null;
  if (nextSku && nextSku !== sku) patch.sku = nextSku;

  const supabase = getStockAdminClient();

  let table = 'website_stock';
  let { data: product, error: lookupError } = await supabase
    .from('website_stock')
    .select('sku, barcode, updated_at, title, category, subcategory_one, subcategory_two, subcategory_three, subcategory_four, mottaro_path')
    .eq('sku', sku)
    .maybeSingle();

  if (lookupError) return res.status(400).json({ error: lookupError.message });
  if (product) product.archived_by = null;

  if (!product) {
    const archived = await supabase
      .from('archived_products')
      .select('sku, barcode, archived_by, updated_at, title, category, subcategory_one, subcategory_two, subcategory_three, subcategory_four, mottaro_path')
      .eq('sku', sku)
      .maybeSingle();
    if (archived.error) return res.status(400).json({ error: archived.error.message });
    if (!archived.data) return res.status(404).json({ error: 'Product not found' });
    product = archived.data;
    table = 'archived_products';
  }

  const categoryFieldsTouched = ['title', 'name', 'category', 'subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four']
    .some((key) => req.body?.[key] !== undefined);
  if (categoryFieldsTouched) {
    try {
      const tree = await loadTaxonomy();
      const categoryPatch = {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.category !== undefined ? { category: patch.category } : {}),
        ...(patch.subcategory_one !== undefined ? { subcategory_one: patch.subcategory_one } : {}),
        ...(patch.subcategory_two !== undefined ? { subcategory_two: patch.subcategory_two } : {}),
        ...(patch.subcategory_three !== undefined ? { subcategory_three: patch.subcategory_three } : {}),
        ...(patch.subcategory_four !== undefined ? { subcategory_four: patch.subcategory_four } : {}),
      };
      const snapshot = mottaroPathSnapshotForRow(product, tree, categoryPatch);
      if (snapshot) patch.mottaro_path = snapshot;
    } catch { /* non-fatal */ }
  }

  if (!Object.keys(patch).length) return res.status(200).json({ ok: true });
  patch.updated_at = new Date().toISOString();

  if (expectedUpdatedAt && product.updated_at && product.updated_at !== expectedUpdatedAt) {
    return res.status(409).json({
      error: 'This product was changed by someone else — reload to see the latest.',
      currentUpdatedAt: product.updated_at,
    });
  }

  if (nextSku && nextSku !== sku) {
    for (const tbl of ['website_stock', 'archived_products']) {
      const { data: clash } = await supabase.from(tbl).select('sku').eq('sku', nextSku).maybeSingle();
      if (clash) return res.status(409).json({ error: `SKU "${nextSku}" already exists` });
    }
  }

  const lookupSku = sku;
  const { error } = await supabase.from(table).update(patch).eq('sku', lookupSku);
  if (error) return res.status(400).json({ error: error.message });

  const verifySku = patch.sku || sku;
  const { data: verified, error: verifyError } = await supabase
    .from(table)
    .select('*')
    .eq('sku', verifySku)
    .maybeSingle();
  if (verifyError) return res.status(400).json({ error: verifyError.message });
  if (!verified) return res.status(500).json({ error: 'Update did not persist — product not found after save' });

  // Nutstore-archived placeholders often have no ERP row yet. When the admin
  // fixes the SKU or barcode on such a row, re-run the ERP/Positill lookup so
  // the row can attach live stock/price on the next Archive refresh.
  let relink = null;
  const changedIdentifier = patch.sku != null || patch.barcode != null;
  if (
    changedIdentifier
    && table === 'archived_products'
    && verified.archived_by === 'nutstore'
  ) {
    try {
      const identifier = verified.barcode || verified.sku;
      const match = await resolveProductLoaderMatch(supabase, {
        code: identifier,
        displayCode: identifier,
        imageSlot: 1,
      });
      if (match?.sqlRow) {
        await ensureProductFromCatalogueRow(supabase, {
          ...verified,
          barcode: verified.barcode || verified.sku,
          sell_price: match.sqlRow.price,
          stock_qty: match.sqlRow.onhand,
          available_stock: match.sqlRow.available,
          original_description: verified.original_description || match.sqlRow.title,
        });
        const relinkPatch = {
          updated_at: new Date().toISOString(),
          price: Number(match.sqlRow.price) || 0,
          stock_qty: Number(match.sqlRow.onhand) || 0,
          available_stock: Number(match.sqlRow.available) ?? (Number(match.sqlRow.onhand) || 0),
        };
        const matchedTitle = String(match.sqlRow.title || '').trim();
        if (matchedTitle) {
          relinkPatch.original_description = matchedTitle;
          relinkPatch.title = matchedTitle;
        }
        const { error: relinkErr } = await supabase
          .from('archived_products')
          .update(relinkPatch)
          .eq('sku', verifySku);
        if (relinkErr) throw relinkErr;
        const { data: refreshed } = await supabase
          .from('archived_products')
          .select('*')
          .eq('sku', verifySku)
          .maybeSingle();
        if (refreshed) Object.assign(verified, refreshed);
        relink = {
          matched: true,
          matchedBy: match.matchedBy,
          stock: match.sqlRow.available,
          price: match.sqlRow.price,
        };
      } else if (match?.websiteRow) {
        const relinkPatch = {
          updated_at: new Date().toISOString(),
          price: Number(match.websiteRow.price) || 0,
        };
        if (match.websiteRow.stock_qty != null) relinkPatch.stock_qty = Number(match.websiteRow.stock_qty);
        if (match.websiteRow.available_stock != null) {
          relinkPatch.available_stock = Number(match.websiteRow.available_stock);
        }
        const matchedTitle = String(
          match.websiteRow.original_description || match.websiteRow.title || '',
        ).trim();
        if (matchedTitle) {
          relinkPatch.original_description = matchedTitle;
          relinkPatch.title = matchedTitle;
        }
        const { error: relinkErr } = await supabase
          .from('archived_products')
          .update(relinkPatch)
          .eq('sku', verifySku);
        if (relinkErr) throw relinkErr;
        const { data: refreshed } = await supabase
          .from('archived_products')
          .select('*')
          .eq('sku', verifySku)
          .maybeSingle();
        if (refreshed) Object.assign(verified, refreshed);
        relink = { matched: true, matchedBy: match.matchedBy };
      } else {
        relink = { matched: false };
      }
    } catch (err) {
      // Non-fatal — the row is updated even if relink fails.
      relink = { matched: false, error: err.message || 'relink failed' };
    }
  }

  return res.status(200).json({ ok: true, product: verified, relink });
}
