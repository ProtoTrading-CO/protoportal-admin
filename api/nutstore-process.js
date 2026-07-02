import { createClient } from '@supabase/supabase-js';
import { requireAdminKey } from './_admin-auth.js';
import { logProductLoaderAudit } from './_product-loader-audit.js';
import { downloadNutstoreFile, isNutstoreConfigured, nutstoreSetupMessage } from './_nutstore-webdav.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const BUCKET = 'product-images';
const DORMANT_BY = 'new-products';
const SLOT_FIELDS = ['image_url_one', 'image_url_two', 'image_url_three', 'image_url_four'];

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function uploadImageBuffer(sb, { sku, slot, filename, buffer, contentType }) {
  await sb.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const ext = String(filename).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const objectPath = `${sku}/${slot}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: contentType || 'image/jpeg',
    upsert: true,
  });
  if (error) throw error;
  const { data: { publicUrl } } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
  return publicUrl;
}

async function publishOne(sb, item, { overwriteImage }) {
  const sku = String(item.code || '').trim().toUpperCase();
  const path = String(item.path || '').trim();
  if (!sku || !path) throw new Error('code and path required');

  const category = String(item.category || '').trim();
  const subcategoryOne = String(item.subcategoryOne || item.subcategory_one || category).trim();
  if (!category || !subcategoryOne) throw new Error('category and subcategoryOne required');

  const { buffer, contentType, filename } = await downloadNutstoreFile(path);
  const imageUrl = await uploadImageBuffer(sb, { sku, slot: 1, filename, buffer, contentType });

  const slot = 1;
  const imageField = SLOT_FIELDS[slot - 1];
  const { data: existing, error: lookupErr } = await sb
    .from('website_stock')
    .select('*')
    .eq('sku', sku)
    .maybeSingle();
  if (lookupErr) throw lookupErr;

  const shouldOverwrite = overwriteImage || item.overwriteImage || item.warnings?.includes('image_exists');
  if (existing?.[imageField] && !shouldOverwrite) {
    const err = new Error(`Image slot 1 already has an image for ${sku}`);
    err.code = 'image_exists';
    throw err;
  }

  const now = new Date().toISOString();
  const title = String(item.title || item.sqlRow?.title || sku).trim();
  const price = Number(item.price ?? item.sqlRow?.price ?? 0);
  const description = String(
    item.description || item.websiteRow?.original_description || item.sqlRow?.title || title,
  ).trim();

  const patch = {
    title,
    price,
    category,
    subcategory_one: subcategoryOne,
    subcategory_two: item.subcategoryTwo || item.subcategory_two || null,
    original_description: description,
    [imageField]: imageUrl,
    updated_at: now,
  };
  if (item.sqlRow?.onhand != null) patch.stock_qty = Number(item.sqlRow.onhand);
  if (item.sqlRow?.available != null) patch.available_stock = Number(item.sqlRow.available);

  let action;
  if (existing) {
    action = 'update';
    const { error } = await sb.from('website_stock').update(patch).eq('sku', sku);
    if (error) throw error;
  } else {
    action = 'create';
    const { error } = await sb.from('website_stock').insert({
      sku,
      barcode: String(item.barcode || sku).trim(),
      ...patch,
      stock_qty: patch.stock_qty ?? 0,
      available_stock: patch.available_stock ?? patch.stock_qty ?? 0,
      image_url_two: null,
      image_url_three: null,
      image_url_four: null,
    });
    if (error) throw error;
  }

  await logProductLoaderAudit(sb, {
    sku,
    action,
    source: 'nutstore_product_loader',
    publishMode: 'direct',
    imageSlot: 1,
    imageSource: 'nutstore',
    oldValues: existing ? { title: existing.title, price: existing.price, [imageField]: existing[imageField] } : null,
    newValues: {
      outcome: 'published',
      title,
      price,
      category,
      subcategoryOne,
      imageUrl,
      nutstorePath: path,
      filename: item.filename || filename,
    },
    publishedBy: String(item.publishedBy || '').trim() || null,
  });

  return { sku, action, imageUrl };
}

async function archiveOne(sb, item) {
  const sku = String(item.code || '').trim().toUpperCase();
  const path = String(item.path || '').trim();
  if (!sku || !path) throw new Error('code and path required');

  const category = String(item.category || '').trim();
  const subcategoryOne = String(item.subcategoryOne || item.subcategory_one || category).trim();
  if (!category || !subcategoryOne) throw new Error('category and subcategoryOne required');

  const { buffer, contentType, filename } = await downloadNutstoreFile(path);
  const imageUrl = await uploadImageBuffer(sb, { sku, slot: 1, filename, buffer, contentType });

  const title = String(item.title || item.sqlRow?.title || sku).trim();
  const now = new Date().toISOString();
  const payload = {
    sku,
    barcode: sku,
    title,
    original_description: String(
      item.description || item.websiteRow?.original_description || item.sqlRow?.title || title,
    ).trim(),
    price: Number(item.price ?? item.sqlRow?.price ?? 0),
    category,
    subcategory_one: subcategoryOne,
    subcategory_two: item.subcategoryTwo || item.subcategory_two || null,
    subcategory_three: item.subcategoryThree || item.subcategory_three || null,
    subcategory_four: item.subcategoryFour || item.subcategory_four || null,
    image_url_one: imageUrl,
    archived_by: DORMANT_BY,
    archived_at: now,
    updated_at: now,
  };

  const { data: existing } = await sb.from('archived_products').select('sku, archived_by').eq('sku', sku).maybeSingle();
  if (existing && existing.archived_by !== DORMANT_BY) {
    throw new Error(`SKU "${sku}" is archived as "${existing.archived_by}"`);
  }

  if (existing) {
    const { error } = await sb.from('archived_products').update(payload).eq('sku', sku);
    if (error) throw error;
  } else {
    const { error } = await sb.from('archived_products').insert(payload);
    if (error) throw error;
  }

  await logProductLoaderAudit(sb, {
    sku,
    action: existing ? 'update' : 'create',
    source: 'nutstore_product_loader',
    publishMode: 'dormant',
    imageSlot: 1,
    imageSource: 'nutstore',
    newValues: {
      outcome: 'dormant',
      title,
      category,
      subcategoryOne,
      imageUrl,
      nutstorePath: path,
      filename: item.filename || filename,
    },
    publishedBy: String(item.publishedBy || '').trim() || null,
  });

  return { sku, imageUrl };
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  if (!isNutstoreConfigured()) {
    return res.status(503).json({ error: nutstoreSetupMessage() });
  }

  const { action, items, overwriteImage = false } = req.body || {};
  if (!['publish', 'archive'].includes(action)) {
    return res.status(400).json({ error: 'action must be publish or archive' });
  }
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'items[] required' });
  }

  const sb = getStockClient();
  const results = [];

  for (const raw of items) {
    const sku = String(raw.code || '').trim().toUpperCase();
    try {
      const result = action === 'publish'
        ? await publishOne(sb, raw, { overwriteImage })
        : await archiveOne(sb, raw);
      results.push({ sku, ok: true, ...result });
    } catch (err) {
      results.push({ sku, ok: false, error: err.message || 'failed', code: err.code || null });
    }
  }

  const failed = results.filter((r) => !r.ok);
  const succeeded = results.filter((r) => r.ok);
  return res.status(failed.length ? 207 : 200).json({
    ok: failed.length === 0,
    action,
    processed: results.length,
    succeeded: succeeded.length,
    failed: failed.length,
    results,
  });
}
