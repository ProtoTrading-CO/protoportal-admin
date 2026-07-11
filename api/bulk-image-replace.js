import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { runInChunks } from '../lib/bulk-chunk.mjs';
import {
  BULK_IMAGE_REPLACE_MAX,
  BULK_IMAGE_REPLACE_REQUEST_BATCH,
  BULK_IMAGE_REPLACE_SLOT_COLS,
  BULK_IMAGE_REPLACE_UPLOAD_CONCURRENCY,
} from '../lib/bulk-image-replace.mjs';
import { parseLoaderFilename } from './_product-loader-lookup.js';
import { siblingSkuForCopy } from './_product-loader-filename.js';

export const config = { api: { bodyParser: { sizeLimit: '20mb' } } };

const BUCKET = 'product-images';

function getStockAdminClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function normalizeSkuList(raw) {
  const seen = new Set();
  const out = [];
  for (const row of raw || []) {
    const sku = String(row || '').trim().toUpperCase();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    out.push(sku);
    if (out.length >= BULK_IMAGE_REPLACE_MAX) break;
  }
  return out;
}

function normalizeSlot(raw) {
  return Math.min(4, Math.max(1, Number(raw) || 1));
}

function normalizeScope(raw) {
  return String(raw || 'live').trim().toLowerCase() === 'archived' ? 'archived' : 'live';
}

// Staged previews and recycle-bin rows are managed by their own flows —
// bulk replace must never write into them.
const ARCHIVED_PROTECTED_BY = new Set(['new-products', 'recycle-bin']);

async function findArchivedRow(supabase, sku) {
  const { data, error } = await supabase
    .from('archived_products')
    .select('sku, archived_by, barcode')
    .eq('sku', sku)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function handlePreflight(supabase, skus, slot, scope) {
  if (!skus.length) return { ok: true, found: [], missing: [] };

  const table = scope === 'archived' ? 'archived_products' : 'website_stock';
  const found = [];
  const missing = [];
  const chunks = [];
  for (let i = 0; i < skus.length; i += 100) {
    chunks.push(skus.slice(i, i + 100));
  }

  const foundSet = new Set();
  for (const chunk of chunks) {
    const { data, error } = await supabase
      .from(table)
      .select(scope === 'archived' ? 'sku, archived_by' : 'sku')
      .in('sku', chunk);
    if (error) throw error;
    for (const row of data || []) {
      if (scope === 'archived' && ARCHIVED_PROTECTED_BY.has(row.archived_by)) continue;
      foundSet.add(String(row.sku || '').trim().toUpperCase());
    }
  }

  for (const sku of skus) {
    if (foundSet.has(sku)) found.push(sku);
    else missing.push(sku);
  }

  return { ok: true, found, missing, slot, scope };
}

async function replaceOneItem(supabase, raw, allowedSet, slot, scope) {
  const sku = String(raw.sku || '').trim().toUpperCase();
  const filename = String(raw.filename || '');
  const contentType = String(raw.contentType || 'image/jpeg');
  const base64 = String(raw.base64 || '');

  if (!sku || !base64) {
    return { sku, ok: false, error: 'sku_and_image_required' };
  }
  if (!allowedSet.has(sku)) {
    return { sku, ok: false, error: 'sku_not_in_selection' };
  }

  const parsed = parseLoaderFilename(filename);
  // Exact-product-match-first: if the file's FULL code (slot suffix kept)
  // is itself an allowed SKU (a real variant ending in .2/.3/.4), this file
  // is slot 1 of THAT product — never a slot suffix of the base code.
  const fullCodeUpper = String(parsed.fullCode || '').trim().toUpperCase();
  const strippedCodeUpper = String(parsed.code || '').trim().toUpperCase();
  const exactMatch = fullCodeUpper
    && fullCodeUpper !== strippedCodeUpper
    && allowedSet.has(fullCodeUpper);
  const fileSlot = exactMatch ? 1 : (parsed.imageSlot || 1);
  if (fileSlot !== slot) {
    return { sku, ok: false, error: `wrong_slot_expected_${slot}_got_${fileSlot}` };
  }
  const fileSku = exactMatch ? fullCodeUpper : strippedCodeUpper;
  const fileCandidates = (parsed.codeCandidates || []).map((c) => String(c || '').trim().toUpperCase());
  // A duplicate "CODE (2).jpg" legitimately targets the sibling record CODE-2.
  const siblingSku = siblingSkuForCopy(parsed.code, parsed.copyIndex);

  try {
    // Fetch the target row first so we know its barcode — a file may be labelled
    // with the product's code/barcode rather than its SKU (e.g. after the code
    // was changed to differ from the SKU). Both are valid ways to name the file.
    let rowBarcode = '';
    let archivedRow = null;
    if (scope === 'archived') {
      archivedRow = await findArchivedRow(supabase, sku);
      if (!archivedRow) return { sku, ok: false, error: 'not_in_archived_products' };
      if (ARCHIVED_PROTECTED_BY.has(archivedRow.archived_by)) {
        return { sku, ok: false, error: 'archived_row_protected' };
      }
      rowBarcode = String(archivedRow.barcode || '').trim().toUpperCase();
    } else {
      const { data: row, error: fetchErr } = await supabase
        .from('website_stock')
        .select('sku, barcode')
        .eq('sku', sku)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (!row) return { sku, ok: false, error: 'not_in_website_stock' };
      rowBarcode = String(row.barcode || '').trim().toUpperCase();
    }

    // The file must correspond to this target — by its SKU, its barcode, a
    // duplicate sibling, or one of the parsed candidate codes.
    const matchesTarget = !fileSku
      || fileSku === sku
      || (rowBarcode && fileSku === rowBarcode)
      || siblingSku === sku
      || fileCandidates.includes(sku)
      || (rowBarcode && fileCandidates.includes(rowBarcode));
    if (!matchesTarget) {
      return { sku, ok: false, error: 'filename_sku_mismatch' };
    }

    const ext = filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const objectPath = `${sku}/${slot}.${ext}`;
    const buffer = Buffer.from(base64, 'base64');
    const { error: uploadErr } = await supabase.storage
      .from(BUCKET)
      .upload(objectPath, buffer, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
    // The object path is reused (upsert), so the URL is byte-identical run to
    // run and the browser/CDN keeps serving the OLD image. A version query
    // param makes each replaced image a fresh URL so the new picture shows in
    // the admin, the preview, and the live site.
    const bustedUrl = `${publicUrl}?v=${Date.now()}`;
    const col = BULK_IMAGE_REPLACE_SLOT_COLS[slot - 1];
    const patch = { [col]: bustedUrl, updated_at: new Date().toISOString() };

    if (scope === 'archived') {
      const { error: patchErr } = await supabase
        .from('archived_products')
        .update(patch)
        .eq('sku', sku);
      if (patchErr) throw patchErr;
      // A live twin shares the same storage object, so its image content
      // already changed with the upload above — keep its slot URL in sync
      // too, and surface (rather than swallow) a failed sync.
      const { data: liveTwin } = await supabase
        .from('website_stock').select('sku').eq('sku', sku).maybeSingle();
      if (liveTwin) {
        const { error: syncErr } = await supabase
          .from('website_stock').update(patch).eq('sku', sku);
        if (syncErr) {
          return { sku, ok: true, slot, scope, url: bustedUrl, warning: `live_sync_failed: ${syncErr.message}` };
        }
      }
    } else {
      const { error: patchErr } = await supabase
        .from('website_stock')
        .update(patch)
        .eq('sku', sku);
      if (patchErr) throw patchErr;
    }

    return { sku, ok: true, slot, scope, url: bustedUrl };
  } catch (err) {
    return { sku, ok: false, error: err.message || 'replace_failed' };
  }
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const body = req.body || {};
  const action = String(body.action || 'replace').trim().toLowerCase();
  const slot = normalizeSlot(body.slot);
  const scope = normalizeScope(body.scope);
  const allowedSkus = normalizeSkuList(body.allowedSkus || body.skus);

  if (allowedSkus.length > BULK_IMAGE_REPLACE_MAX) {
    return res.status(400).json({ error: `Maximum ${BULK_IMAGE_REPLACE_MAX} SKUs per run` });
  }

  const supabase = getStockAdminClient();
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

  if (action === 'preflight') {
    try {
      const result = await handlePreflight(supabase, allowedSkus, slot, scope);
      return res.status(200).json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Preflight failed' });
    }
  }

  if (action !== 'replace') {
    return res.status(400).json({ error: 'Invalid action' });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) {
    return res.status(400).json({ error: 'items[] required' });
  }
  if (items.length > BULK_IMAGE_REPLACE_REQUEST_BATCH) {
    return res.status(400).json({
      error: `Maximum ${BULK_IMAGE_REPLACE_REQUEST_BATCH} items per request`,
    });
  }

  const allowedSet = new Set(allowedSkus);
  const results = await runInChunks(
    items,
    BULK_IMAGE_REPLACE_UPLOAD_CONCURRENCY,
    (item) => replaceOneItem(supabase, item, allowedSet, slot, scope),
  );

  const failed = results.filter((r) => !r.ok);
  return res.status(failed.length ? 207 : 200).json({
    ok: failed.length === 0,
    replaced: results.filter((r) => r.ok).length,
    failed,
    results,
  });
}
