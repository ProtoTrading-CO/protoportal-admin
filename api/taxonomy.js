import { requireOwner } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import {
  labelToSlug,
  addCategoryNode,
  addSubcategoryNode,
  archiveProductsForDeletedNode,
  archiveMotarroProductsUnderNode,
  buildCategoryProductCounts,
  collectMotarroSkusUnderNode,
  countProductsForNode,
  countRenameOrphans,
  deleteNodeCascade,
  findNodeContext,
  loadTaxonomy,
  readMottaroHiddenIds,
  readTaxonomyForApi,
  renameNodeLabel,
  renameNodeLabelInProducts,
  resolveLabelsFromPathIds,
  saveTaxonomy,
  writeMottaroHiddenIds,
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
  await writeSiteConfigJson(SORT_FILE, { orders: nextOrders, updatedAt: new Date().toISOString() });
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
  if (!(await requireOwner(req, res))) return;

  if (req.method === 'GET') {
    try {
      // Categories AND updatedAt come from ONE fresh read so the tree and the
      // lock token can never disagree (that split made edits look reverted).
      const { categories, updatedAt } = await readTaxonomyForApi();
      if (req.query.counts === '1') {
        const onlyInStock = req.query.onlyInStock === '1' || req.query.onlyInStock === 'true';
        const counts = await buildCategoryProductCounts(getStockClient(), categories, { onlyInStock });
        // Counts need a full-table scan; a short edge cache is fine, but keep
        // it tight so admin badges and portal empty-hiding stay close to live.
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=45');
        return res.status(200).json({ categories, counts, updatedAt });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ categories, updatedAt });
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
    // Writes always operate on a FRESH tree (never the 5s cache) so an edit
    // is never built on a stale snapshot from another instance.
    let tree = await loadTaxonomy({ bypassCache: true });

    // The Mottaro branch is virtual — injected on read, stripped on save.
    // Rename / add-subcategory still no-op, so reject those clearly. DELETE is
    // supported via a hidden-ids list (see the deleteNode branch below).
    const isMottaroId = (id) => id === 'mottaro' || String(id || '').startsWith('mottaro-');
    if (action === 'rename' && isMottaroId(req.body?.id)) {
      return res.status(400).json({ error: 'Motarro categories are automatic and cannot be renamed here.' });
    }
    if (action === 'addSubcategory' && isMottaroId(req.body?.parentId)) {
      return res.status(400).json({ error: 'Motarro is an automatic category — you cannot add subcategories under it.' });
    }

    // Delete a Motarro subcategory: archive the products under it, then hide
    // the (virtual) node so it stops appearing. The Motarro root cannot go.
    if (action === 'deleteNode' && isMottaroId(req.body?.id)) {
      const { id } = req.body;
      if (id === 'mottaro') {
        return res.status(400).json({ error: 'The Motarro category itself cannot be deleted.' });
      }
      // Use the injected tree that still contains the node so products under it
      // resolve for archiving. Archive FIRST, then hide — if archiving fails
      // the node stays visible so the admin can retry.
      let archiveResult;
      try {
        archiveResult = await archiveMotarroProductsUnderNode(supabase, tree, id);
      } catch (err) {
        return res.status(502).json({ error: `Could not archive products under this Motarro subcategory: ${err.message || err}. Nothing was deleted — try again.` });
      }
      if (archiveResult.failures.length) {
        return res.status(502).json({
          error: `${archiveResult.failures.length} of ${archiveResult.total} product(s) could not be archived — the subcategory was not deleted. Try again.`,
          productsArchived: archiveResult.archived,
        });
      }
      const hidden = await readMottaroHiddenIds({ bypassCache: true });
      await writeMottaroHiddenIds([...hidden, id]);
      return res.status(200).json({
        ok: true,
        id,
        mottaroDeleted: true,
        productsArchived: archiveResult.archived,
      });
    }

    if (action === 'restoreMottaroNode') {
      const { id } = req.body;
      if (!isMottaroId(id) || id === 'mottaro') return res.status(400).json({ error: 'Not a Motarro subcategory.' });
      const hidden = await readMottaroHiddenIds({ bypassCache: true });
      const next = hidden.filter((h) => h !== id);
      await writeMottaroHiddenIds(next);
      return res.status(200).json({ ok: true, id, restored: true });
    }

    if (action === 'listHiddenMottaro') {
      const hidden = await readMottaroHiddenIds({ bypassCache: true });
      return res.status(200).json({ ids: hidden });
    }

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
      // Archive the products FIRST — only remove the category from the tree if
      // every product moved to the Archive. If any fail, the category is left
      // intact so the admin can retry, rather than deleting the node and
      // leaving orphaned live products behind.
      let archiveResult;
      try {
        archiveResult = await archiveProductsForDeletedNode(supabase, ctx);
      } catch (err) {
        return res.status(502).json({ error: `Could not archive products under this category: ${err.message || err}. Category was not deleted — try again.` });
      }
      if (archiveResult.failures.length) {
        return res.status(502).json({
          error: `${archiveResult.failures.length} of ${archiveResult.total} product(s) could not be archived — category was not deleted. Try again.`,
          productsArchived: archiveResult.archived,
        });
      }
      const { tree: next } = deleteNodeCascade(tree, id);
      const saved = await saveTaxonomy(next, { expectedUpdatedAt });
      try {
        await pruneSortOrdersForNode(ctx, id);
      } catch { /* best effort — orphaned sort keys are harmless until slug reuse */ }
      return res.status(200).json({
        ok: true,
        id,
        productsArchived: archiveResult.archived,
        updatedAt: saved.updatedAt,
      });
    }

    if (action === 'countSubcategoryProducts') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });
      // Motarro nodes are virtual — count products by their derived Motarro path.
      if (isMottaroId(id)) {
        const skus = await collectMotarroSkusUnderNode(supabase, tree, id);
        return res.status(200).json({ productCount: skus.length, mottaro: true });
      }
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
