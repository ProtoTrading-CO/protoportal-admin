import { INTENT_REGISTRY } from './registry.js';
import {
  detectAmbiguousTerm,
  detectCustomerEntity,
  detectProductEntity,
  formatClarifyReply,
  normalizeQuery,
} from './entities.js';

const EXACT_SCORE = 100;
const SYNONYM_SCORE = 70;
const ENTITY_SCORE = 95;

/**
 * @typedef {object} IntentResolution
 * @property {true} ok
 * @property {string} intentId
 * @property {string} biIntent
 * @property {string} [formatSection]
 * @property {string} [formatType]
 * @property {object} params
 * @property {'exact'|'synonym'|'entity'} method
 * @property {number} confidence
 */

/**
 * @typedef {object} IntentClarify
 * @property {false} ok
 * @property {'clarify'} reason
 * @property {object} clarify
 * @property {string} reply
 */

/**
 * Resolve a user question to a business intent (deterministic).
 * @param {string} query
 * @returns {IntentResolution|IntentClarify|null}
 */
export function resolveIntent(query) {
  const q = normalizeQuery(query);
  if (!q) return null;

  const productEntity = detectProductEntity(q);
  if (productEntity) {
    return buildResolution('product_lookup', productEntity, 'entity', ENTITY_SCORE);
  }

  const customerEntity = detectCustomerEntity(q);
  if (customerEntity) {
    return buildResolution('customer_lookup', customerEntity, 'entity', ENTITY_SCORE);
  }

  const scored = scoreRegistryMatches(q);
  if (scored.length) {
    const top = scored[0];
    const runnerUp = scored[1];
    if (runnerUp && top.score === runnerUp.score && top.intentId !== runnerUp.intentId) {
      return buildIntentClarify(top, runnerUp, q);
    }
    return buildResolution(top.intentId, top.params, top.method, top.score / 100);
  }

  const ambiguous = detectAmbiguousTerm(q);
  if (ambiguous) {
    return {
      ok: false,
      reason: 'clarify',
      clarify: {
        term: ambiguous.term,
        message: `**${ambiguous.term}** could mean a product line, a department, or a supplier.`,
        options: ambiguous.options,
      },
      reply: formatClarifyReply({
        term: ambiguous.term,
        message: `**${ambiguous.term}** could mean a product line, a department, or a supplier.`,
        options: ambiguous.options,
      }),
    };
  }

  return null;
}

function scoreRegistryMatches(q) {
  /** @type {Array<{ intentId: string, score: number, method: 'exact'|'synonym', params: object }>} */
  const hits = [];

  for (const def of Object.values(INTENT_REGISTRY)) {
    let bestScore = 0;
    let method = 'synonym';

    for (const re of def.exact || []) {
      if (re.test(q)) {
        bestScore = Math.max(bestScore, EXACT_SCORE + (def.priority || 0) / 10);
        method = 'exact';
      }
    }

    for (const re of def.synonyms || []) {
      if (re.test(q)) {
        bestScore = Math.max(bestScore, SYNONYM_SCORE + (def.priority || 0) / 10);
        if (method !== 'exact') method = 'synonym';
      }
    }

    if (!bestScore) continue;

    let params = {};
    if (def.paramsFromQuery) {
      const p = def.paramsFromQuery(q);
      if (!p) continue;
      params = p;
    }

    hits.push({ intentId: def.id, score: bestScore, method, params });
  }

  return hits.sort((a, b) => b.score - a.score);
}

function buildResolution(intentId, params, method, confidence) {
  const def = INTENT_REGISTRY[intentId];
  if (!def) return null;

  const formatType = intentId === 'inventory_attention' ? (params.type || 'all') : undefined;

  return {
    ok: true,
    intentId,
    biIntent: def.biIntent,
    formatSection: def.formatSection,
    formatType,
    params: { ...params },
    method,
    confidence: Math.min(1, confidence),
  };
}

function buildIntentClarify(a, b, q) {
  const label = (id) => INTENT_REGISTRY[id]?.id || id;
  return {
    ok: false,
    reason: 'clarify',
    clarify: {
      term: q,
      message: 'That could match more than one type of business question.',
      options: [
        { id: a.intentId, label: label(a.intentId), hint: exampleForIntent(a.intentId) },
        { id: b.intentId, label: label(b.intentId), hint: exampleForIntent(b.intentId) },
      ],
    },
    reply: formatClarifyReply({
      message: 'That could match more than one type of business question.',
      options: [
        { id: a.intentId, label: label(a.intentId), hint: exampleForIntent(a.intentId) },
        { id: b.intentId, label: label(b.intentId), hint: exampleForIntent(b.intentId) },
      ],
    }),
  };
}

function exampleForIntent(intentId) {
  const examples = {
    daily_brief: 'What needs my attention today?',
    yesterday_summary: 'What changed yesterday?',
    business_health: 'How is the business doing?',
    website_summary: 'Website changes',
    inventory_attention: 'Negative stock',
    product_lookup: 'Show product 8610100001',
    customer_lookup: 'Find customer Plushprops',
  };
  return examples[intentId] || intentId;
}

/**
 * Map resolution to experience route shape (apollo.js compatibility).
 * @param {IntentResolution} resolved
 */
export function resolutionToRoute(resolved) {
  if (!resolved?.ok) return null;
  return {
    intent: resolved.biIntent,
    businessIntent: resolved.intentId,
    params: resolved.params,
    formatType: resolved.formatType,
    formatSection: resolved.formatSection,
    confidence: resolved.confidence,
    method: resolved.method,
  };
}

/** @deprecated use resolveIntent */
export function detectExperienceRoute(query) {
  const resolved = resolveIntent(query);
  if (!resolved) return null;
  if (!resolved.ok) return { clarify: resolved.clarify, reply: resolved.reply };
  return resolutionToRoute(resolved);
}
