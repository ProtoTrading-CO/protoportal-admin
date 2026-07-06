import bundledCategories from '../data/categories.json';
import { labelToSlug } from './taxonomy';

let _taxonomyUpdatedAt = null;

export function getTaxonomyUpdatedAt() {
  return _taxonomyUpdatedAt;
}

async function postTaxonomy(body) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...body,
      expectedUpdatedAt: getTaxonomyUpdatedAt(),
    }),
  });
  const json = await res.json();
  if (res.status === 409) {
    const err = new Error(json.error || 'Categories were changed by someone else — reload before saving.');
    err.status = 409;
    err.currentUpdatedAt = json.currentUpdatedAt;
    throw err;
  }
  if (!res.ok) throw new Error(json.error || 'Taxonomy update failed');
  if (json.updatedAt) _taxonomyUpdatedAt = json.updatedAt;
  return json;
}

export async function fetchTaxonomy({ withCounts = false } = {}) {
  try {
    const qs = withCounts ? '?counts=1' : '';
    const res = await fetch(`/api/taxonomy${qs}`);
    if (!res.ok) throw new Error(`Taxonomy ${res.status}`);
    const json = await res.json();
    _taxonomyUpdatedAt = json.updatedAt || _taxonomyUpdatedAt;
    const categories = json.categories || bundledCategories;
    return withCounts
      ? { categories, counts: json.counts || {}, updatedAt: _taxonomyUpdatedAt }
      : categories;
  } catch {
    return withCounts ? { categories: bundledCategories, counts: {}, updatedAt: null } : bundledCategories;
  }
}

export async function fetchCategoryProductCounts({ onlyInStock = false } = {}) {
  const params = new URLSearchParams({ counts: '1', _: String(Date.now()) });
  if (onlyInStock) params.set('onlyInStock', '1');
  const res = await fetch(`/api/taxonomy?${params}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to load category counts');
  if (json.updatedAt) _taxonomyUpdatedAt = json.updatedAt;
  return json.counts || {};
}

export async function renameTaxonomyNode(id, label) {
  return postTaxonomy({ action: 'rename', id, label });
}

export async function createCategory(label) {
  return postTaxonomy({ action: 'addCategory', label });
}

export async function createSubcategory(parentId, label) {
  return postTaxonomy({ action: 'addSubcategory', parentId, label });
}

// Deletes a category or subcategory (and its subtree). Products are kept and
// become uncategorised — the server reports how many were affected.
export async function deleteTaxonomyNode(id) {
  return postTaxonomy({ action: 'deleteNode', id });
}

export async function countSubcategoryProducts(id) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'countSubcategoryProducts', id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Count failed');
  return json.productCount || 0;
}

export function findInTree(tree, id) {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.children?.length) {
      const hit = findInTree(node.children, id);
      if (hit) return hit;
    }
  }
  return null;
}

export function categoryLabelFromTree(tree, id) {
  return findInTree(tree, id)?.label || id;
}

export function subcategoryOptionsFromTree(tree, categoryId) {
  return findInTree(tree, categoryId)?.children || [];
}

export function childrenOfTree(tree, id) {
  if (!id) return [];
  const stack = [...(tree || [])];
  while (stack.length) {
    const node = stack.shift();
    if (node.id === id) return node.children || [];
    if (node.children?.length) stack.push(...node.children);
  }
  return [];
}

export function flattenSubcategories(nodes, depth = 1, prefix = '') {
  const out = [];
  for (const node of nodes || []) {
    const path = prefix ? `${prefix} › ${node.label}` : node.label;
    out.push({ id: node.id, label: node.label, depth, path });
    if (node.children?.length) {
      out.push(...flattenSubcategories(node.children, depth + 1, path));
    }
  }
  return out;
}

export async function replaceFullTaxonomy(categories) {
  return postTaxonomy({ action: 'replace', categories });
}

export { labelToSlug, bundledCategories };
