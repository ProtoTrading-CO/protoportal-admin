import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import {
  addCategoryNode,
  addSubcategoryNode,
  buildCategoryProductCounts,
  buildRenameFilter,
  countProductsForNode,
  deleteNodeCascade,
  deleteSubcategoryNode,
  findNodeContext,
  loadTaxonomy,
  readTaxonomyStore,
  renameNodeLabel,
  resolveLabelsFromPathIds,
  saveTaxonomy,
} from './_taxonomy-utils.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function applyRenameToTable(supabase, table, ctx, oldLabel, newLabel) {
  const { column, filters } = buildRenameFilter(ctx, oldLabel);
  let q = supabase.from(table).update({ [column]: newLabel, updated_at: new Date().toISOString() });
  for (const [key, val] of Object.entries(filters)) {
    if (val != null) q = q.eq(key, val);
  }
  const { error } = await q;
  if (error) throw error;
}

async function renameProductsForNode(supabase, ctx, oldLabel, newLabel) {
  await applyRenameToTable(supabase, 'website_stock', ctx, oldLabel, newLabel);
  await applyRenameToTable(supabase, 'archived_products', ctx, oldLabel, newLabel);
}

function taxonomyConflictResponse(res, err) {
  return res.status(409).json({
    error: err.message || 'Categories were changed by someone else — reload before saving.',
    currentUpdatedAt: err.currentUpdatedAt || null,
  });
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;

  if (req.method === 'GET') {
    try {
      const store = await readTaxonomyStore();
      const categories = await loadTaxonomy();
      if (req.query.counts === '1') {
        const counts = await buildCategoryProductCounts(getStockClient(), categories);
        // Category counts require a full-table scan; serve from the edge for
        // 60s and revalidate in the background for the next 5 minutes.
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
        return res.status(200).json({ categories, counts, updatedAt: store.updatedAt });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ categories, updatedAt: store.updatedAt });
    } catch (err) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: err.message || 'Failed to load taxonomy' });
    }
  }

  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') return res.status(405).end();

  const { action, expectedUpdatedAt } = req.body || {};
  const supabase = getStockClient();

  try {
    let tree = await loadTaxonomy();

    if (action === 'rename') {
      const { id, label } = req.body;
      const { tree: next, oldLabel, ctx } = renameNodeLabel(tree, id, label);
      await renameProductsForNode(supabase, ctx, oldLabel, label.trim());
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      return res.status(200).json({ ok: true, id, label: label.trim(), updatedAt: saved.updatedAt });
    }

    if (action === 'addCategory') {
      const { label } = req.body;
      const { tree: next, node, created } = addCategoryNode(tree, label);
      let updatedAt = null;
      if (created) {
        const saved = await saveTaxonomy(next, { expectedUpdatedAt });
        updatedAt = saved.updatedAt;
      }
      return res.status(200).json({ ok: true, node, created, updatedAt });
    }

    if (action === 'addSubcategory') {
      const { parentId, label } = req.body;
      const { tree: next, node, created } = addSubcategoryNode(tree, parentId, label);
      let updatedAt = null;
      if (created) {
        const saved = await saveTaxonomy(next, { expectedUpdatedAt });
        updatedAt = saved.updatedAt;
      }
      return res.status(200).json({ ok: true, node, created, updatedAt });
    }

    if (action === 'replace') {
      const { categories } = req.body;
      if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories array required' });
      const saved = await saveTaxonomy(categories, { expectedUpdatedAt });
      return res.status(200).json({ ok: true, updatedAt: saved.updatedAt });
    }

    if (action === 'deleteSubcategory') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ctx = findNodeContext(tree, id);
      if (!ctx) return res.status(404).json({ error: 'Subcategory not found' });
      const productCount = await countProductsForNode(supabase, ctx);
      if (productCount > 0) {
        return res.status(400).json({
          error: `Cannot delete — ${productCount} live product(s) still use this subcategory. Move or archive them first.`,
          productCount,
        });
      }
      const { tree: next } = deleteSubcategoryNode(tree, id);
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      return res.status(200).json({ ok: true, id, productCount: 0, updatedAt: saved.updatedAt });
    }

    if (action === 'deleteNode') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ctx = findNodeContext(tree, id);
      if (!ctx) return res.status(404).json({ error: 'Category not found' });
      let productCount = 0;
      try { productCount = await countProductsForNode(supabase, ctx); } catch { /* best effort */ }
      const { tree: next } = deleteNodeCascade(tree, id);
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      return res.status(200).json({ ok: true, id, productCount, updatedAt: saved.updatedAt });
    }

    if (action === 'countSubcategoryProducts') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ctx = findNodeContext(tree, id);
      if (!ctx) return res.status(404).json({ error: 'Subcategory not found' });
      const productCount = await countProductsForNode(supabase, ctx);
      return res.status(200).json({ productCount });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    if (err.status === 409) return taxonomyConflictResponse(res, err);
    return res.status(400).json({ error: err.message || 'Taxonomy update failed' });
  }
}
