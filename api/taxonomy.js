import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import {
  addCategoryNode,
  addSubcategoryNode,
  buildRenameFilter,
  countProductsForNode,
  deleteNodeCascade,
  deleteSubcategoryNode,
  findNodeContext,
  loadTaxonomy,
  renameNodeLabel,
  saveTaxonomy,
} from './_taxonomy-utils.js';

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
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

export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const categories = await loadTaxonomy();
      return res.status(200).json({ categories });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load taxonomy' });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body || {};
  const supabase = getStockClient();

  try {
    let tree = await loadTaxonomy();

    if (action === 'rename') {
      const { id, label } = req.body;
      const { tree: next, oldLabel, ctx } = renameNodeLabel(tree, id, label);
      const counts = await renameProductsForNode(supabase, ctx, oldLabel, label.trim());
      await saveTaxonomy(next);
      return res.status(200).json({ ok: true, id, label: label.trim() });
    }

    if (action === 'addCategory') {
      const { label } = req.body;
      const { tree: next, node, created } = addCategoryNode(tree, label);
      if (created) await saveTaxonomy(next);
      return res.status(200).json({ ok: true, node, created });
    }

    if (action === 'addSubcategory') {
      const { parentId, label } = req.body;
      const { tree: next, node, created } = addSubcategoryNode(tree, parentId, label);
      if (created) await saveTaxonomy(next);
      return res.status(200).json({ ok: true, node, created });
    }

    if (action === 'replace') {
      const { categories } = req.body;
      if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories array required' });
      await saveTaxonomy(categories);
      return res.status(200).json({ ok: true });
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
      await saveTaxonomy(next);
      return res.status(200).json({ ok: true, id, productCount: 0 });
    }

    if (action === 'deleteNode') {
      // Delete a category or subcategory (and its subtree). Products are kept —
      // they just become uncategorised. We still report how many are affected.
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ctx = findNodeContext(tree, id);
      if (!ctx) return res.status(404).json({ error: 'Category not found' });
      let productCount = 0;
      try { productCount = await countProductsForNode(supabase, ctx); } catch { /* best effort */ }
      const { tree: next } = deleteNodeCascade(tree, id);
      await saveTaxonomy(next);
      return res.status(200).json({ ok: true, id, productCount });
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
    return res.status(400).json({ error: err.message || 'Taxonomy update failed' });
  }
}
