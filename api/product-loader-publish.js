import { createClient } from '@supabase/supabase-js';
import { catalogueDescription, catalogueDisplayTitle } from '../lib/product-loader-display.mjs';
import { requireAdminKey } from './_admin-auth.js';
import { logProductLoaderAudit } from './_product-loader-audit.js';

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
    subcategoryThree,
    subcategoryFour,
    description,
    publishedBy,
    publishMode = 'direct',
    categoryConfidence,
    stockQty,
    availableStock,
    barcode: bodyBarcode,
    filename,
    displayCode,
    sqlRow,
    websiteRow,
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
  const erpBarcode = String(bodyBarcode || existing?.barcode || sku).trim();
  const catalogItem = {
    code: sku,
    displayCode,
    title,
    description,
    barcode: erpBarcode,
    sqlRow: sqlRow || null,
    websiteRow: websiteRow || null,
  };
  const resolvedTitle = catalogueDisplayTitle(catalogItem);
  const resolvedDescription = catalogueDescription(catalogItem);

  // Never overwrite a real price with 0. On re-publish (e.g. adding an image
  // slot) the resolved price can be 0 when there's no ERP/website match — in
  // that case keep the existing DB price instead of dropping the product to R0.
  const numericPrice = Number(price);
  const hasValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;
  const patch = {
    title: resolvedTitle,
    price: hasValidPrice ? numericPrice : (Number(existing?.price) || 0),
    category: String(category || '').trim(),
    subcategory_one: String(subcategoryOne || category || '').trim(),
    subcategory_two: subcategoryTwo ? String(subcategoryTwo).trim() : null,
    subcategory_three: subcategoryThree ? String(subcategoryThree).trim() : null,
    subcategory_four: subcategoryFour ? String(subcategoryFour).trim() : null,
    [imageField]: String(imageUrl).trim(),
    updated_at: now,
  };

  if (resolvedDescription) patch.original_description = resolvedDescription;
  if (stockQty != null && Number.isFinite(Number(stockQty))) patch.stock_qty = Number(stockQty);
  if (availableStock != null && Number.isFinite(Number(availableStock))) patch.available_stock = Number(availableStock);

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
      barcode: erpBarcode,
      title: patch.title,
      price: patch.price,
      category: patch.category,
      subcategory_one: patch.subcategory_one,
      subcategory_two: patch.subcategory_two || null,
      subcategory_three: patch.subcategory_three || null,
      subcategory_four: patch.subcategory_four || null,
      original_description: patch.original_description || '',
      stock_qty: patch.stock_qty ?? 0,
      available_stock: patch.available_stock ?? patch.stock_qty ?? 0,
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

  await logProductLoaderAudit(sb, {
    sku,
    action,
    source: 'manual_product_loader',
    publishMode: String(publishMode || 'direct'),
    imageSlot: slot,
    imageSource: String(imageSource || 'upload'),
    categoryConfidence: categoryConfidence != null ? Number(categoryConfidence) : null,
    oldValues: existing
      ? {
        title: existing.title,
        price: existing.price,
        category: existing.category,
        subcategory_one: existing.subcategory_one,
        [imageField]: existing[imageField],
      }
      : null,
    newValues: {
      outcome: 'published',
      title: patch.title,
      price: patch.price,
      category: patch.category,
      subcategoryOne: patch.subcategory_one,
      subcategoryTwo: patch.subcategory_two,
      subcategoryThree: patch.subcategory_three,
      subcategoryFour: patch.subcategory_four,
      imageUrl,
      imageSlot: slot,
      imageSource,
      publishMode,
      filename: String(filename || '').trim() || null,
    },
    publishedBy: String(publishedBy || '').trim() || null,
  });

  return res.status(200).json({ ok: true, action, sku });
}
