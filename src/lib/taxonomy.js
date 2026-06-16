import categories from '../data/categories.json';

// IMPORTANT: this MUST stay identical to labelToSlug in scripts/lib/master.mjs.
// The category generator fails on slug collisions, which guarantees this is a
// safe 1:1 mapping between a label and its slug at every level of the tree.
export function labelToSlug(label) {
  if (label === null || label === undefined) return '';
  return String(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Flat slug -> label map (first occurrence wins) for display helpers.
const SLUG_TO_LABEL = {};
(function index(nodes) {
  for (const n of nodes) {
    if (!(n.id in SLUG_TO_LABEL)) SLUG_TO_LABEL[n.id] = n.label;
    if (n.children?.length) index(n.children);
  }
})(categories);

export function slugToLabel(slug) {
  if (!slug) return '';
  return SLUG_TO_LABEL[slug] || String(slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build slug → label map from a live taxonomy tree (merged with bundled defaults). */
export function buildSlugToLabelMap(tree) {
  const map = { ...SLUG_TO_LABEL };
  function index(nodes) {
    for (const n of nodes || []) {
      map[n.id] = n.label;
      if (n.children?.length) index(n.children);
    }
  }
  index(tree);
  return map;
}

export function slugToLabelFromTree(slug, tree) {
  if (!slug) return '';
  if (Array.isArray(tree) && tree.length) {
    const map = buildSlugToLabelMap(tree);
    if (map[slug]) return map[slug];
  }
  return slugToLabel(slug);
}

/** Legacy nav ids whose slug no longer matches labelToSlug(label) after a rename. */
const LEGACY_NAV_ALIASES = {
  'arts-crafts-stationery': 'art-supplies-and-stationery',
};

/**
 * Map a navigation path (taxonomy node ids) to product categoryPath slugs.
 * Sort orders and product counts must use this key so the trade portal matches.
 */
export function resolveNavPathForProducts(navPath, categories) {
  if (!Array.isArray(navPath) || !navPath.length) return [];
  if (!Array.isArray(categories) || !categories.length) {
    return navPath.map((seg, i) => (i === 0 && LEGACY_NAV_ALIASES[seg]) || seg);
  }

  const out = [];
  let nodes = categories;
  for (let i = 0; i < navPath.length; i += 1) {
    const seg = navPath[i];
    const node = (nodes || []).find((n) => n.id === seg);
    if (!node) {
      out.push(i === 0 && LEGACY_NAV_ALIASES[seg] ? LEGACY_NAV_ALIASES[seg] : seg);
      break;
    }
    if (i === 0 && LEGACY_NAV_ALIASES[seg]) {
      out.push(LEGACY_NAV_ALIASES[seg]);
    } else {
      out.push(labelToSlug(node.label));
    }
    nodes = node.children || [];
  }
  return out;
}

/** Canonical key for sort-order storage (matches trade portal lookup). */
export function sortOrderCategoryKey(navPath, categories) {
  const resolved = resolveNavPathForProducts(navPath, categories);
  if (resolved.length) return resolved.join('/');
  return Array.isArray(navPath) && navPath.length ? navPath.join('/') : '';
}

/** All keys that may hold a saved order for this nav path (canonical + legacy). */
export function sortOrderLookupKeys(navPath, categories) {
  if (!Array.isArray(navPath) || !navPath.length) return [];
  const keys = [];
  const seen = new Set();
  const add = (key) => {
    if (!key || seen.has(key)) return;
    seen.add(key);
    keys.push(key);
  };

  add(sortOrderCategoryKey(navPath, categories));
  add(navPath.join('/'));

  const resolved = resolveNavPathForProducts(navPath, categories);
  if (resolved.length) add(resolved.join('/'));

  const alias = LEGACY_NAV_ALIASES[navPath[0]];
  if (alias) {
    add([alias, ...navPath.slice(1)].join('/'));
    add([navPath[0], ...navPath.slice(1)].join('/'));
  }

  return keys;
}

/** Find skuOrder[] for a category path in a sort-order store. */
export function lookupSortOrder(sortOrders, navPath, categories) {
  if (!sortOrders || !navPath?.length) return null;
  for (const key of sortOrderLookupKeys(navPath, categories)) {
    const skuOrder = sortOrders[key]?.skuOrder;
    if (Array.isArray(skuOrder) && skuOrder.length) return skuOrder;
  }
  return null;
}

export function applySkuOrder(products, skuOrder) {
  if (!skuOrder?.length) return products;
  const orderMap = new Map(skuOrder.map((id, i) => [id, i]));
  return [...products].sort((a, b) => (orderMap.get(a.id) ?? 999999) - (orderMap.get(b.id) ?? 999999));
}

/** Build a slug categoryPath from human labels (category + ordered subcategory levels). */
export function buildCategoryPath(category, subLabels = []) {
  const catSlug = labelToSlug(category);
  if (!catSlug) return [];
  const path = [catSlug];
  for (const sub of subLabels) {
    if (sub) path.push(labelToSlug(sub));
  }
  return path;
}

function normalizeLabel(label) {
  return String(label || '').trim().toLowerCase();
}

/**
 * Resolve a product row's labels to the *current* taxonomy node ids.
 * Taxonomy ids stay stable across rename, but product rows store the live
 * labels, so we must walk the tree by label match to get the right ids.
 */
export function resolveCategoryIdsFromTree(row, tree) {
  const fallback = () => {
    const ids = [];
    if (row.category) ids.push(labelToSlug(row.category));
    for (const col of ['subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four']) {
      if (row[col]) ids.push(labelToSlug(row[col])); else break;
    }
    return { categoryId: ids[0] || '', categoryPath: ids };
  };

  if (!Array.isArray(tree) || !tree.length) return fallback();

  const labels = [row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four];
  const ids = [];
  let level = tree;
  for (const rawLabel of labels) {
    if (!rawLabel) break;
    const target = normalizeLabel(rawLabel);
    const node = (level || []).find((n) => normalizeLabel(n.label) === target);
    if (!node) {
      ids.push(labelToSlug(rawLabel));
      break;
    }
    ids.push(node.id);
    level = node.children || [];
  }
  return { categoryId: ids[0] || '', categoryPath: ids };
}

export { categories };
