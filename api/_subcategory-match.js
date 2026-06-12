import { loadBundledTaxonomy } from './_taxonomy-utils.js';

const STOP = new Set(['and', 'the', 'or', 'in', 'of', 'for', 'a', 'an', 'subcategory', 'category']);

function flattenNodes(nodes) {
  const flat = [];
  for (const n of nodes || []) {
    flat.push({ id: n.id, label: n.label });
    if (n.children?.length) flat.push(...flattenNodes(n.children));
  }
  return flat;
}

const TAXONOMY_NODES = flattenNodes(loadBundledTaxonomy());

/** Tokenize for fuzzy label match — "Games & Puzzles" and "games and puzzles" → [games, puzzles] */
export function tokenizeLabel(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP.has(w));
}

function tokensMatch(needle, haystack) {
  if (!needle.length) return false;
  const hay = new Set(haystack);
  return needle.every((t) => hay.has(t));
}

/** Resolve free-text to taxonomy node labels (e.g. "games and puzzles" → "Games & Puzzles"). */
export function resolveTaxonomyLabels(terms) {
  const needle = tokenizeLabel(terms);
  if (!needle.length) return [];

  const hits = TAXONOMY_NODES.filter((node) => {
    const fromLabel = tokenizeLabel(node.label);
    const fromId = tokenizeLabel(node.id.replace(/-/g, ' '));
    return tokensMatch(needle, fromLabel) || tokensMatch(needle, fromId);
  });

  return [...new Set(hits.map((n) => n.label))];
}

export function suggestSubcategories(terms, limit = 5) {
  const needle = tokenizeLabel(terms);
  if (!needle.length) return [];

  return TAXONOMY_NODES
    .map((node) => {
      const labelTokens = tokenizeLabel(node.label);
      const score = needle.filter((t) => labelTokens.includes(t)).length;
      return { label: node.label, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.label);
}

function productSubcategories(p) {
  return [p.subcategory_one, p.subcategory_two, p.subcategory_three, p.subcategory_four].filter(Boolean);
}

function labelMatchesSearch(label, needleTokens, canonicalLabels) {
  const labelTokens = tokenizeLabel(label);
  if (tokensMatch(needleTokens, labelTokens)) return true;
  return canonicalLabels.some((canonical) => tokensMatch(tokenizeLabel(canonical), labelTokens));
}

export function findProductsBySubcategory(products, terms) {
  const needleTokens = tokenizeLabel(terms);
  if (!needleTokens.length) return [];

  const canonicalLabels = resolveTaxonomyLabels(terms);

  return products.all.filter((p) => {
    const labels = [...productSubcategories(p), p.category];
    return labels.some((label) => labelMatchesSearch(label, needleTokens, canonicalLabels));
  });
}

/** Match products by title, SKU, barcode, or category keywords (e.g. "monttaro canvas"). */
export function findProductsByKeyword(products, terms) {
  const needleTokens = tokenizeLabel(terms);
  if (!needleTokens.length) return [];

  return products.all.filter((p) => {
    const hay = tokenizeLabel([
      p.title,
      p.sku,
      p.barcode,
      p.category,
      p.subcategory_one,
      p.subcategory_two,
    ].filter(Boolean).join(' '));
    return tokensMatch(needleTokens, hay);
  });
}
