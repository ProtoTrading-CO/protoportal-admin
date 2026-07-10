const SOURCE_WEIGHTS = {
  conversation: 0.95,
  workspace: 0.92,
  entity_registry: 0.88,
  workspace_data: 0.85,
};

/**
 * Merge source tags and compute overall confidence from inherited entity coverage.
 * @param {string[]} sources
 * @param {{ hasCustomer?: boolean, hasSupplier?: boolean, hasContainer?: boolean, hasWorkspace?: boolean }} coverage
 */
export function buildContextConfidence(sources, coverage = {}) {
  const unique = [...new Set(sources.filter(Boolean))];
  if (!unique.length) {
    return { confidence: 0, sources: [] };
  }

  let confidence = 0;
  for (const source of unique) {
    confidence = Math.max(confidence, SOURCE_WEIGHTS[source] || 0.5);
  }

  const entityCount = [
    coverage.hasWorkspace,
    coverage.hasCustomer,
    coverage.hasSupplier,
    coverage.hasContainer,
  ].filter(Boolean).length;

  if (entityCount >= 2) {
    confidence = Math.min(0.99, confidence + 0.03);
  }
  if (entityCount >= 3) {
    confidence = Math.min(0.99, confidence + 0.02);
  }

  return {
    confidence: Number(confidence.toFixed(2)),
    sources: unique,
  };
}
