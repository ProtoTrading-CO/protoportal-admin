import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { labelsToDbFields, loadTaxonomy, resolveLabelsForSubcategory, resolveLabelsFromPathIds } from './_taxonomy-utils.js';
import { restoreArchivedToLive } from './_ensure-product.js';
import { BULK_CHUNK_SIZE, MOVE_UPDATE_CHUNK_SIZE, runInChunks } from '../lib/bulk-chunk.mjs';

function sliceIntoChunks(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks;
}

/** Chunked `.update().in('sku', …)` — one failed chunk does not fail other chunks. */
async function chunkedInUpdate(supabase, table, skus, updatePayload) {
  if (!skus.length) return [];
  const chunks = sliceIntoChunks(skus, MOVE_UPDATE_CHUNK_SIZE);
  const chunkResults = await runInChunks(chunks, 1, async (skuChunk) => {
    const { error } = await supabase.from(table).update(updatePayload).in('sku', skuChunk);
    return skuChunk.map((sku) => (
      error ? { sku, ok: false, error: error.message } : { sku, ok: true }
    ));
  });
  return chunkResults.flat();
}

/** Chunked `.delete().in('sku', …)` — per-chunk failure isolation. */
async function chunkedInDelete(supabase, table, skus) {
  if (!skus.length) return { results: [], failedSkus: new Set() };
  const failedSkus = new Set();
  const results = [];
  const chunks = sliceIntoChunks(skus, MOVE_UPDATE_CHUNK_SIZE);
  const chunkResults = await runInChunks(chunks, 1, async (skuChunk) => {
    const { error } = await supabase.from(table).delete().in('sku', skuChunk);
    return skuChunk.map((sku) => {
      if (error) {
        failedSkus.add(sku);
        return { sku, ok: false, error: error.message };
      }
      return { sku, ok: true };
    });
  });
  for (const row of chunkResults.flat()) results.push(row);
  return { results, failedSkus };
}

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function resolveSkuTables(supabase, skus) {
  const liveSkus = new Set();
  const archSkus = new Set();
  const CHUNK = 200;
  for (let i = 0; i < skus.length; i += CHUNK) {
    const chunk = skus.slice(i, i + CHUNK);
    const [{ data: live }, { data: arch }] = await Promise.all([
      supabase.from('website_stock').select('sku').in('sku', chunk),
      supabase.from('archived_products').select('sku').in('sku', chunk),
    ]);
    for (const row of live || []) liveSkus.add(row.sku);
    for (const row of arch || []) archSkus.add(row.sku);
  }
  return { liveSkus, archSkus };
}

async function archiveProduct(supabase, sku) {
  const { data: live } = await supabase.from('website_stock').select('sku').eq('sku', sku).maybeSingle();
  if (!live) return { sku, ok: false, error: 'Not in active catalogue' };
  const { error } = await supabase.rpc('archive_product', { p_sku: sku, p_by: 'admin-bulk' });
  if (error) return { sku, ok: false, error: error.message };
  return { sku, ok: true };
}

async function unarchiveProduct(supabase, sku) {
  try {
    const result = await restoreArchivedToLive(supabase, sku);
    return { sku, ok: true, alreadyLive: !!result.alreadyLive };
  } catch (err) {
    return { sku, ok: false, error: err.message || 'Restore failed' };
  }
}

async function bulkMoveProducts(supabase, normalizedSkus, dbFields) {
  const updatePayload = { ...dbFields, updated_at: new Date().toISOString() };
  const { liveSkus, archSkus } = await resolveSkuTables(supabase, normalizedSkus);
  const found = new Set([...liveSkus, ...archSkus]);
  const results = [];
  const liveList = normalizedSkus.filter((sku) => liveSkus.has(sku));
  const archList = normalizedSkus.filter((sku) => archSkus.has(sku));

  if (liveList.length) {
    results.push(...await chunkedInUpdate(supabase, 'website_stock', liveList, updatePayload));
  }

  if (archList.length) {
    results.push(...await chunkedInUpdate(supabase, 'archived_products', archList, updatePayload));
  }

  for (const sku of normalizedSkus) {
    if (!found.has(sku)) results.push({ sku, ok: false, error: 'Not found' });
  }

  return results;
}

async function bulkDeleteProducts(supabase, normalizedSkus) {
  const { liveSkus, archSkus } = await resolveSkuTables(supabase, normalizedSkus);
  const found = new Set([...liveSkus, ...archSkus]);
  const results = [];
  const failedSkus = new Set();

  const liveList = normalizedSkus.filter((sku) => liveSkus.has(sku));
  const archList = normalizedSkus.filter((sku) => archSkus.has(sku));

  if (liveList.length) {
    const liveOutcome = await chunkedInDelete(supabase, 'website_stock', liveList);
    results.push(...liveOutcome.results);
    for (const sku of liveOutcome.failedSkus) failedSkus.add(sku);
  }

  if (archList.length) {
    const archOutcome = await chunkedInDelete(supabase, 'archived_products', archList);
    results.push(...archOutcome.results);
    for (const sku of archOutcome.failedSkus) failedSkus.add(sku);
  }

  if (normalizedSkus.length) {
    const previewChunks = sliceIntoChunks(normalizedSkus, MOVE_UPDATE_CHUNK_SIZE);
    for (const chunk of previewChunks) {
      await supabase.from('staged_product_previews').delete().in('sku', chunk).catch(() => {});
    }
  }

  for (const sku of normalizedSkus) {
    if (!found.has(sku)) {
      results.push({ sku, ok: false, error: 'Not found' });
    } else if (!failedSkus.has(sku)) {
      results.push({ sku, ok: true });
    }
  }

  return results;
}

async function bulkArchiveOrUnarchive(supabase, normalizedSkus, action) {
  const fn = action === 'archive' ? archiveProduct : unarchiveProduct;
  const chunked = await runInChunks(normalizedSkus, BULK_CHUNK_SIZE, (sku) => fn(supabase, sku));
  return chunked.map((row) => {
    if (row.error && !row.sku) return { sku: row.item, ok: false, error: row.error };
    return row;
  });
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { action, skus, categoryId, subcategoryId, categoryPathIds } = req.body || {};
  const normalizedSkus = [...new Set((skus || []).map((s) => String(s).trim()).filter(Boolean))];
  if (!normalizedSkus.length) return res.status(400).json({ error: 'No products selected' });

  const supabase = getStockClient();

  try {
    if (action === 'move') {
      if (!categoryId && !(Array.isArray(categoryPathIds) && categoryPathIds.length)) {
        return res.status(400).json({ error: 'Destination category is required' });
      }
      const tree = await loadTaxonomy();
      let labels;
      try {
        if (Array.isArray(categoryPathIds) && categoryPathIds.length >= 2) {
          labels = resolveLabelsFromPathIds(tree, categoryPathIds);
        } else {
          if (!categoryId) return res.status(400).json({ error: 'Main category is required' });
          if (!subcategoryId) return res.status(400).json({ error: 'Choose a subcategory destination' });
          labels = resolveLabelsForSubcategory(tree, categoryId, subcategoryId);
        }
      } catch (err) {
        // The taxonomy tree changed between the admin opening the modal and
        // clicking Confirm — return 409 so the client can reload categories
        // and re-select the destination instead of writing to a stale path.
        return res.status(409).json({
          error: 'Destination category changed — reload categories and reselect.',
          detail: err.message || 'Invalid category path',
        });
      }
      if (labels.length < 2) {
        return res.status(400).json({ error: 'Choose a main category and at least one subcategory' });
      }
      const dbFields = labelsToDbFields(labels);
      const destinationPath = labels.join(' › ');
      const results = await bulkMoveProducts(supabase, normalizedSkus, dbFields);
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        moved: results.filter((r) => r.ok).length,
        failed,
        destinationPath,
      });
    }

    if (action === 'archive') {
      const results = await bulkArchiveOrUnarchive(supabase, normalizedSkus, 'archive');
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        archived: results.filter((r) => r.ok).length,
        failed,
      });
    }

    if (action === 'delete') {
      const results = await bulkDeleteProducts(supabase, normalizedSkus);
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        deleted: results.filter((r) => r.ok).length,
        failed,
      });
    }

    if (action === 'unarchive') {
      const results = await bulkArchiveOrUnarchive(supabase, normalizedSkus, 'unarchive');
      const failed = results.filter((r) => !r.ok);
      return res.status(failed.length ? 207 : 200).json({
        ok: failed.length === 0,
        restored: results.filter((r) => r.ok).length,
        failed,
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Bulk operation failed' });
  }
}
