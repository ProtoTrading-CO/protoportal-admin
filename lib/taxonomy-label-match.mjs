/** Shared taxonomy label normalization — admin counts, rename, delete, portal parity. */

export function normalizeTaxonomyLabel(label) {
  return String(label || '').trim().toLowerCase();
}

export function matchesTaxonomyLabel(dbValue, expectedLabel) {
  if (expectedLabel == null || expectedLabel === '') return dbValue == null || dbValue === '';
  return normalizeTaxonomyLabel(dbValue) === normalizeTaxonomyLabel(expectedLabel);
}

export function rowMatchesTaxonomyFilters(row, filters = {}) {
  for (const [column, expected] of Object.entries(filters)) {
    if (expected == null || expected === '') continue;
    if (!matchesTaxonomyLabel(row?.[column], expected)) return false;
  }
  return true;
}

export function applyIlikeTaxonomyFilters(query, filters = {}) {
  let q = query;
  for (const [column, expected] of Object.entries(filters)) {
    if (expected == null || expected === '') continue;
    q = q.ilike(column, String(expected).trim());
  }
  return q;
}

export function countLabelOrphans(rows, column, oldLabel, filters = {}) {
  let n = 0;
  for (const row of rows || []) {
    if (!rowMatchesTaxonomyFilters(row, filters)) continue;
    if (matchesTaxonomyLabel(row?.[column], oldLabel)) n += 1;
  }
  return n;
}
