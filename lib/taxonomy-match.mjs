/**
 * Shared taxonomy label matching.
 *
 * Product rows store category *labels* (not ids), and historic imports left
 * whitespace/case variants behind ("Fasteners " vs "fasteners"). Every code
 * path that compares a DB label against a taxonomy node label — rename,
 * delete, counting, browse filtering — must use the same rules or they
 * drift apart and the admin lies about what's where.
 */

/** Canonical form for comparison: collapse whitespace, trim, lowercase. */
export function normalizeLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** True when a DB column value refers to the given taxonomy node label. */
export function matchesTaxonomyLabel(dbValue, treeLabel) {
  const target = normalizeLabel(treeLabel);
  if (!target) return false;
  return normalizeLabel(dbValue) === target;
}

/** Escape %, _ and \ so a label can be embedded in an ilike pattern. */
export function escapeIlikePattern(value) {
  return String(value ?? '').replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * True when a row's label columns match a node scope:
 * scope = { category: label, subcategory_one: label, ... } as produced by
 * buildNodeProductFilter / buildRenameFilter. Whitespace/case tolerant.
 */
export function rowMatchesLabelScope(row, scopeFilters) {
  for (const [column, label] of Object.entries(scopeFilters)) {
    if (label == null) continue;
    if (!matchesTaxonomyLabel(row?.[column], label)) return false;
  }
  return true;
}
