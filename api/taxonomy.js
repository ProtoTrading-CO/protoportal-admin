import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import {
  labelToSlug,
  addCategoryNode,
  addSubcategoryNode,
  buildCategoryProductCounts,
  clearProductsForDeletedNode,
  countProductsForNode,
  countRenameOrphans,
  deleteNodeCascade,
  findNodeContext,
  loadTaxonomy,
  readTaxonomyStore,
  renameNodeLabel,
  renameNodeLabelInProducts,
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

const SORT_FILE = 'sort-orders/orders.json';

/**
 * Prune saved sort orders for a deleted node and its descendants — otherwise
 * the orphaned skuOrder entry is silently inherited if the same slug is
 * later recreated. Keys exist in two forms (slug path and node-id path);
 * prune both. Best effort.
 */
async function pruneSortOrdersForNode(ctx, id) {
  const slugPrefix = [...ctx.ancestors.map((a) => labelToSlug(a.label)), labelToSlug(ctx.node.label)].join('/');
  const idPrefix = [...ctx.ancestors.map((a) => a.id), id].join('/');
  const store = await readSiteConfigJson(SORT_FILE, null);
  if (!store?.orders) return 0;
  const matches = (key) => key === slugPrefix || key.startsWith(`${slugPrefix}/`)
    || key === idPrefix || key.startsWith(`${idPrefix}/`);
  const keys = Object.keys(store.orders).filter(matches);
  if (!keys.length) return 0;
  const nextOrders = { ...store.orders };
  for (const key of keys) delete nextOrders[key];
  await writeSiteConfigJson(SORT_FILE, { orders: nextOrders });
  return keys.length;
}

async function renameProductsForNode(supabase, ctx, oldLabel, newLabel) {
  let renamed = 0;
  for (const table of ['website_stock', 'archived_products']) {
    const result = await renameNodeLabelInProducts(supabase, table, ctx, oldLabel, newLabel);
    renamed += result.renamed;
  }
  return renamed;
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
        const onlyInStock = req.query.onlyInStock === '1' || req.query.onlyInStock === 'true';
        const counts = await buildCategoryProductCounts(getStockClient(), categories, { onlyInStock });
        // Category counts require a full-table scan; serve from the edge for
        // 60s and revalidate in the background for the next 5 minutes.
        // onlyInStock is part of the URL, so each mode gets its own cache entry.
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
      const newLabel = label.trim();
      // Save the tree FIRST — saveTaxonomy holds the optimistic-lock check.
      // Renaming product rows before it meant a 409 (concurrent editor) left
      // every product on the new label while the tree kept the old node.
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      let renameError = null;
      let productsRenamed = 0;
      try {
        productsRenamed = await renameProductsForNode(supabase, ctx, oldLabel, newLabel);
      } catch (err) {
        renameError = err.message || 'Failed to rename product labels';
      }
      // Verification pass — anything still carrying the old label under this
      // scope escaped the rename and would orphan out of the tree.
      let orphansRemaining = 0;
      try {
        orphansRemaining = await countRenameOrphans(supabase, ctx, oldLabel, newLabel);
      } catch { /* best effort — rename itself already succeeded */ }
      return res.status(200).json({
        ok: true,
        id,
        label: newLabel,
        updatedAt: saved.updatedAt,
        productsRenamed,
        orphansRemaining,
        renameError,
      });
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

    if (action === 'deleteNode') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ctx = findNodeContext(tree, id);
      if (!ctx) return res.status(404).json({ error: 'Category not found' });
      const { tree: next } = deleteNodeCascade(tree, id);
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      // Clear stored labels on affected products so they surface under
      // Uncategorised (or their remaining parent) instead of leaving phantom
      // category paths on the live site.
      let productsCleared = 0;
      let clearError = null;
      try {
        productsCleared = await clearProductsForDeletedNode(supabase, ctx);
      } catch (err) {
        clearError = err.message || 'Failed to clear product labels';
      }
      try {
        await pruneSortOrdersForNode(ctx, id);
      } catch { /* best effort — orphaned sort keys are harmless until slug reuse */ }
      return res.status(200).json({
        ok: true,
        id,
        productsCleared,
        clearError,
        updatedAt: saved.updatedAt,
      });
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
