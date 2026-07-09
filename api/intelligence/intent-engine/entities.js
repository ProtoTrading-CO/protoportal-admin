/** @deprecated Import from entity-registry — re-exported for backward compatibility. */
export {
  normalizeQuery,
  extractSku,
  detectAmbiguousTerm,
  formatClarifyReply,
} from '../entity-registry/detect.js';

import {
  detectProductEntity as detectProductEntityFull,
  detectCustomerEntity as detectCustomerEntityFull,
} from '../entity-registry/detect.js';

/** Legacy shape: `{ code }` instead of full entity hit. */
export function detectProductEntity(query) {
  const hit = detectProductEntityFull(query);
  return hit ? { code: hit.params.code } : null;
}

/** Legacy shape: `{ q }` instead of full entity hit. */
export function detectCustomerEntity(query) {
  const hit = detectCustomerEntityFull(query);
  return hit ? { q: hit.params.q } : null;
}
