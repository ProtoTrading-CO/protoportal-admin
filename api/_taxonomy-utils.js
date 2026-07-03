import { readFileSync } from 'fs';
import { join } from 'path';
import { readSiteConfigJson, writeSiteConfigJson } from './_site-config.js';
import { isPublishableOnWebsite } from '../lib/catalog-stock.mjs';
import { isMotarroProduct, inferMotarroPathFromRow, injectMotarroIntoTree } from './_mottaro-category.js';

const TAXONOMY_FILE = 'taxonomy/categories.json';
const BUNDLED_PATH = join(process.cwd(), 'src/data/categories.json');

export function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function loadBundledTaxonomy() {
  return JSON.parse(readFileSync(BUNDLED_PATH, 'utf8'));
}

let _taxonomyCache = null;
let _taxonomyCachedAt = 0;
const TAXONOMY_TTL_MS = 60_000;

export function invalidateTaxonomyCache() {
  _taxonomyCache = null;
  _taxonomyCachedAt = 0;
}

function withMotarro(categories) {
  return injectMotarroIntoTree(Array.isArray(categories) ? categories : []);
}

export async function loadTaxonomy({ bypassCache = false } = {}) {
  const now = Date.now();
  if (!bypassCache && _taxonomyCache && now - _taxonomyCachedAt < TAXONOMY_TTL_MS) {
    return withMotarro(_taxonomyCache);
  }
  try {
    const stored = await readSiteConfigJson(TAXONOMY_FILE, null);
    if (Array.isArray(stored)) {
      _taxonomyCache = stored;
      _taxonomyCachedAt = now;
      return withMotarro(stored);
    }
    if (stored?.categories && Array.isArray(stored.categories)) {
      _taxonomyCache = stored.categories;
      _taxonomyCachedAt = now;
      return withMotarro(stored.categories);
    }
  } catch { /* fall through */ }
  const bundled = loadBundledTaxonomy();
  _taxonomyCache = bundled;
  _taxonomyCachedAt = now;
  return withMotarro(bundled);
}

/** Read stored taxonomy payload (categories + updatedAt) without Mottaro injection. */
export async function readTaxonomyStore() {
  try {
    const stored = await readSiteConfigJson(TAXONOMY_FILE, null);
    if (Array.isArray(stored)) {
      return { categories: stored, updatedAt: null };
    }
    if (stored?.categories && Array.isArray(stored.categories)) {
      return { categories: stored.categories, updatedAt: stored.updatedAt || null };
    }
  } catch { /* fall through */ }
  const bundled = loadBundledTaxonomy();
  return { categories: bundled, updatedAt: null };
}

export async function saveTaxonomy(categories, { expectedUpdatedAt } = {}) {
  const stripped = (Array.isArray(categories) ? categories : []).filter((c) => c.id !== 'mottaro');

  const expected = expectedUpdatedAt != null ? String(expectedUpdatedAt).trim() : '';
  if (expected) {
    const fresh = await readSiteConfigJson(TAXONOMY_FILE, null);
    const currentUpdatedAt = fresh?.updatedAt || null;
    if (currentUpdatedAt && currentUpdatedAt !== expected) {
      const err = new Error('Categories were changed by someone else — reload before saving.');
      err.status = 409;
      err.currentUpdatedAt = currentUpdatedAt;
      throw err;
    }
  }

  const saved = await writeSiteConfigJson(TAXONOMY_FILE, { categories: stripped });
  invalidateTaxonomyCache();
  _taxonomyCache = stripped;
  _taxonomyCachedAt = Date.now();
  return { categories: withMotarro(stripped), updatedAt: saved.updatedAt || null };
}

export function findNodeContext(tree, id, parent = null, depth = 0, ancestors = []) {
  for (const node of tree) {
    if (node.id === id) return { node, parent, depth, ancestors: [...ancestors] };
    if (node.children?.length) {
      const hit = findNodeContext(node.children, id, node, depth + 1, [...ancestors, node]);
      if (hit) return hit;
    }
  }
  return null;
}

export function findSubPathIds(mainNode, targetId) {
  function walk(nodes, path) {
    for (const node of nodes) {
      const next = [...path, node.id];
      if (node.id === targetId) return next;
      if (node.children?.length) {
        const hit = walk(node.children, next);
        if (hit) return hit;
      }
    }
    return null;
  }
  return walk(mainNode.children || [], []);
}

export function resolvePathLabels(tree, categoryId, subcategoryIds = []) {
  const main = tree.find((c) => c.id === categoryId);
  if (!main) throw new Error('Main category not found');

  const labels = [main.label];
  let children = main.children || [];
  for (const subId of subcategoryIds.filter(Boolean)) {
    const child = children.find((c) => c.id === subId);
    if (!child) throw new Error(`Subcategory "${subId}" not found under ${main.label}`);
    labels.push(child.label);
    children = child.children || [];
  }
  return labels;
}

export function resolveLabelsForSubcategory(tree, categoryId, subcategoryId) {
  const main = tree.find((c) => c.id === categoryId);
  if (!main) throw new Error('Main category not found');
  if (!subcategoryId) throw new Error('Subcategory is required');
  const pathIds = findSubPathIds(main, subcategoryId);
  if (!pathIds?.length) throw new Error('Subcategory not found in this category');
  return resolvePathLabels(tree, categoryId, pathIds);
}

export function labelsToDbFields(labels) {
  return {
    category: labels[0],
    subcategory_one: labels[1] || labels[0],
    subcategory_two: labels[2] || null,
    subcategory_three: labels[3] || null,
    subcategory_four: labels[4] || null,
  };
}

function normalizeLabel(label) {
  return String(label || '').trim().toLowerCase();
}

/**
 * Resolve the current taxonomy ids for a product row's labels.
 * Taxonomy node ids stay stable across rename, but the labels stored in the
 * DB rows change. Filtering / URL generation must use the *current* ids, not
 * a slug derived from the new label.
 *
 * Falls back to slug-of-label when a label has no match in the tree (e.g.
 * a freshly imported product whose category was removed from the taxonomy).
 */
export function resolveCategoryIds(row, tree) {
  if (!Array.isArray(tree) || !tree.length) {
    // No tree available — fall back to slug-of-label so the catalogue keeps loading
    const ids = [];
    if (row.category) ids.push(labelToSlug(row.category));
    for (const col of SUB_COLS) {
      if (row[col]) ids.push(labelToSlug(row[col])); else break;
    }
    return { categoryId: ids[0] || '', categoryPath: ids };
  }

  const labels = [row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four];
  const ids = [];
  let level = tree;
  for (const rawLabel of labels) {
    if (!rawLabel) break;
    const target = normalizeLabel(rawLabel);
    const node = (level || []).find((n) => normalizeLabel(n.label) === target);
    if (!node) {
      // Couldn't resolve this depth — fall back to slug for remainder
      ids.push(labelToSlug(rawLabel));
      break;
    }
    ids.push(node.id);
    level = node.children || [];
  }
  return { categoryId: ids[0] || '', categoryPath: ids };
}

const SUB_COLS = ['subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four'];

export function buildRenameFilter(ctx, oldLabel) {
  const { depth, ancestors } = ctx;
  if (depth === 0) {
    return { column: 'category', filters: { category: oldLabel } };
  }
  const col = SUB_COLS[depth - 1];
  const filters = { category: ancestors[0]?.label };
  for (let i = 1; i < depth; i++) {
    filters[SUB_COLS[i - 1]] = ancestors[i]?.label;
  }
  filters[col] = oldLabel;
  return { column: col, filters };
}

export function addCategoryNode(tree, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Category name is required');
  const id = labelToSlug(trimmed);
  if (!id) throw new Error('Invalid category name');

  const existing = tree.find((c) => c.id === id);
  if (existing) {
    if (existing.label !== trimmed) {
      throw new Error(`Slug collision: "${existing.label}" and "${trimmed}" both map to "${id}"`);
    }
    return { tree, node: existing, created: false };
  }

  const node = { id, label: trimmed, children: [] };
  return { tree: [...tree, node], node, created: true };
}

export function addSubcategoryNode(tree, parentId, label) {
  const trimmed = String(label || '').trim();
  if (!trimmed) throw new Error('Subcategory name is required');
  const id = labelToSlug(trimmed);
  if (!id) throw new Error('Invalid subcategory name');

  const ctx = findNodeContext(tree, parentId);
  if (!ctx) throw new Error('Parent category not found');

  const siblings = ctx.node.children || [];
  const existing = siblings.find((c) => c.id === id);
  if (existing) {
    if (existing.label !== trimmed) {
      throw new Error(`Slug collision: "${existing.label}" and "${trimmed}" both map to "${id}"`);
    }
    return { tree, node: existing, created: false };
  }

  const node = { id, label: trimmed, children: [] };
  ctx.node.children = [...siblings, node];
  return { tree: [...tree], node, created: true };
}

export function renameNodeLabel(tree, id, newLabel) {
  const trimmed = String(newLabel || '').trim();
  if (!trimmed) throw new Error('Name is required');
  const ctx = findNodeContext(tree, id);
  if (!ctx) throw new Error('Category not found');
  const oldLabel = ctx.node.label;
  if (oldLabel === trimmed) return { tree, oldLabel, ctx };
  ctx.node.label = trimmed;
  return { tree: [...tree], oldLabel, ctx };
}

export function deleteSubcategoryNode(tree, id) {
  const ctx = findNodeContext(tree, id);
  if (!ctx) throw new Error('Subcategory not found');
  if (ctx.depth === 0) throw new Error('Main categories cannot be deleted here');
  if (!ctx.parent) throw new Error('Parent category not found');
  if (ctx.node.children?.length) {
    throw new Error('Remove nested subcategories first');
  }
  ctx.parent.children = (ctx.parent.children || []).filter((child) => child.id !== id);
  return { tree: [...tree], ctx };
}

/**
 * Delete a node at any depth (category or subcategory) together with its whole
 * subtree. Products are left untouched — their stored labels remain, so they
 * simply fall back to slug-of-label and show as uncategorised.
 */
export function deleteNodeCascade(tree, id) {
  const ctx = findNodeContext(tree, id);
  if (!ctx) throw new Error('Category not found');
  if (ctx.depth === 0) {
    return { tree: tree.filter((n) => n.id !== id), ctx };
  }
  if (!ctx.parent) throw new Error('Parent category not found');
  ctx.parent.children = (ctx.parent.children || []).filter((child) => child.id !== id);
  return { tree: [...tree], ctx };
}

export function buildNodeProductFilter(ctx) {
  const { depth, ancestors, node } = ctx;
  if (depth === 0) {
    return { filters: { category: node.label } };
  }
  const col = SUB_COLS[depth - 1];
  const filters = { category: ancestors[0]?.label };
  for (let i = 1; i < depth; i++) {
    filters[SUB_COLS[i - 1]] = ancestors[i]?.label;
  }
  filters[col] = node.label;
  return { filters };
}

export async function countProductsForNode(supabase, ctx) {
  const { filters } = buildNodeProductFilter(ctx);
  let q = supabase.from('website_stock').select('sku', { count: 'exact', head: true });
  for (const [key, val] of Object.entries(filters)) {
    if (val != null) q = q.eq(key, val);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}

/** Resolve taxonomy labels from an id path (main + subcategory ids). */
export function resolveLabelsFromPathIds(tree, pathIds = []) {
  const ids = (pathIds || []).filter(Boolean);
  if (!ids.length) throw new Error('Category path is required');
  const labels = [];
  let nodes = tree || [];
  for (const id of ids) {
    const node = nodes.find((n) => n.id === id);
    if (!node) throw new Error(`Unknown category id: ${id}`);
    labels.push(node.label);
    nodes = node.children || [];
  }
  return labels;
}

const COUNT_ROW_COLS = 'category,subcategory_one,subcategory_two,subcategory_three,subcategory_four,title,available_stock,stock_qty';

/** Count live products per taxonomy node (includes all descendants). */
export async function buildCategoryProductCounts(supabase, tree) {
  const counts = { __uncategorized__: 0, __all__: 0 };
  let mottaroLive = 0;
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('website_stock')
      .select(COUNT_ROW_COLS)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = data || [];
    for (const row of batch) {
      if (!isPublishableOnWebsite(row)) continue;
      counts.__all__ += 1;

      const isMottaro = isMotarroProduct(row);
      if (isMottaro) mottaroLive += 1;

      const { categoryPath } = resolveCategoryIds(row, tree);
      if (!categoryPath.length) {
        counts.__uncategorized__ += 1;
      } else {
        for (const id of categoryPath) {
          counts[id] = (counts[id] || 0) + 1;
        }
      }

      if (isMottaro) {
        const mottaroPath = inferMotarroPathFromRow(row, tree);
        for (const id of mottaroPath) {
          counts[id] = (counts[id] || 0) + 1;
        }
      }
    }
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  if (mottaroLive > 0) {
    counts.mottaro = Math.max(counts.mottaro || 0, mottaroLive);
  }

  return counts;
}
