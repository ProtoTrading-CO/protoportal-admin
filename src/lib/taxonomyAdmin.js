import bundledCategories from '../data/categories.json';
import { labelToSlug } from './taxonomy';

export async function fetchTaxonomy() {
  try {
    const res = await fetch('/api/taxonomy');
    if (!res.ok) throw new Error(`Taxonomy ${res.status}`);
    const json = await res.json();
    return json.categories || bundledCategories;
  } catch {
    return bundledCategories;
  }
}

export async function renameTaxonomyNode(id, label) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'rename', id, label }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Rename failed');
  return json;
}

export async function createCategory(label) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addCategory', label }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Create category failed');
  return json;
}

export async function createSubcategory(parentId, label) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'addSubcategory', parentId, label }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Create subcategory failed');
  return json;
}

// Deletes a category or subcategory (and its subtree). Products are kept and
// become uncategorised — the server reports how many were affected.
export async function deleteTaxonomyNode(id) {
  const res = await fetch('/api/taxonomy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'deleteNode', id }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Delete failed');
  return json;
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

export { labelToSlug, bundledCategories };
