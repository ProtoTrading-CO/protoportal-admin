import { entityToIntent, getEntityDefinition } from './registry.js';
import {
  detectContainerEntity,
  detectCustomerEntity,
  detectProductEntity,
  detectSupplierEntity,
  normalizeQuery,
} from './detect.js';

const ENTITY_SCORE = 0.95;

const INTENT_DETECTORS = {
  product_lookup: detectProductEntity,
  customer_lookup: detectCustomerEntity,
  supplier_lookup: detectSupplierEntity,
  container_lookup: detectContainerEntity,
};

/**
 * Resolve user input to a business entity → Business Context route.
 * When intentId is provided (Capability 1.1A), only the matching detector runs.
 * @param {string} query
 * @param {{ intentId?: string }} [options]
 * @returns {EntityResolution|EntityClarify|null}
 */
export function resolveEntity(query, options = {}) {
  const q = normalizeQuery(query);
  if (!q) return null;

  const { intentId } = options;

  if (intentId && INTENT_DETECTORS[intentId]) {
    const hit = INTENT_DETECTORS[intentId](q);
    return hit ? toEntityResolution(hit) : null;
  }

  const detectors = [
    detectProductEntity,
    detectContainerEntity,
    detectSupplierEntity,
    detectCustomerEntity,
  ];

  for (const detect of detectors) {
    const hit = detect(q);
    if (!hit) continue;
    return toEntityResolution(hit);
  }

  return null;
}

function toEntityResolution(hit) {
  const mapped = entityToIntent(hit.entityType);
  if (!mapped) return null;
  const def = getEntityDefinition(hit.entityType);
  return {
    ok: true,
    entityType: hit.entityType,
    entityId: hit.entityId,
    intentId: mapped.intentId,
    biIntent: mapped.biIntent,
    params: { ...hit.params },
    method: 'entity',
    confidence: ENTITY_SCORE,
    label: def?.label || hit.entityType,
  };
}

/**
 * Map entity resolution to experience route shape.
 * @param {EntityResolution} resolved
 */
export function entityResolutionToRoute(resolved) {
  if (!resolved?.ok) return null;
  return {
    intent: resolved.biIntent,
    businessIntent: resolved.intentId,
    entityType: resolved.entityType,
    entityId: resolved.entityId,
    params: resolved.params,
    confidence: resolved.confidence,
    method: resolved.method,
  };
}
