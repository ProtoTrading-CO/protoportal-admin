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
