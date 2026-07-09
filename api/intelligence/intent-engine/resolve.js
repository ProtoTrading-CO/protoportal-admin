import { INTENT_REGISTRY } from './registry.js';
import { detectAmbiguousTerm, formatClarifyReply, normalizeQuery } from '../entity-registry/detect.js';
import { resolveEntity } from '../entity-registry/resolve.js';
import {
  classifyEntityIntent,
  ENTITY_INTENT_IDS,
  extractParamsForIntent,
  matchesSalesAnalysis,
  parseSalesParams,
} from './classify.js';

const EXACT_SCORE = 100;
const SYNONYM_SCORE = 70;

const NON_ENTITY_INTENTS = new Set([
  'daily_brief',
  'yesterday_summary',
  'business_health',
  'website_summary',
  'inventory_attention',
  'sales_analysis',
]);

/**
 * @typedef {object} IntentResolution
 * @property {true} ok
 * @property {string} intentId
 * @property {string} biIntent
 * @property {string} [entityType]
 * @property {string} [entityId]
 * @property {string} [formatSection]
 * @property {string} [formatType]
 * @property {object} params
 * @property {'exact'|'synonym'|'entity'|'intent'} method
 * @property {number} confidence
 */

/**
 * Resolve a user question to a business intent (deterministic).
 * Capability 1.1A: Intent → Entity → Context (not Entity first).
 * @param {string} query
 * @returns {IntentResolution|IntentClarify|null}
 */
export function resolveIntent(query) {
  const q = normalizeQuery(query);
  if (!q) return null;

  // 1. Sales analysis — intent before entity (fixes "tell me about best selling…")
  if (matchesSalesAnalysis(q)) {
    return buildResolution('sales_analysis', parseSalesParams(q), 'intent', 0.92);
  }

  // 2. Registry exact matches for non-entity intents (brief, sections, inventory)
  const scored = scoreRegistryMatches(q);
  const exactNonEntity = scored.filter((s) => s.method === 'exact' && NON_ENTITY_INTENTS.has(s.intentId));
  if (exactNonEntity.length) {
    const tie = resolveTie(exactNonEntity, q);
    if (tie?.reason === 'clarify') return tie;
    const top = exactNonEntity[0];
    return buildResolution(top.intentId, top.params, top.method, top.score / 100);
  }

  // 3. Intent-first classification for entity-backed routes
  const intentId = classifyEntityIntent(q);
  if (intentId === 'sales_analysis') {
    return buildResolution('sales_analysis', parseSalesParams(q), 'intent', 0.92);
  }

  if (intentId && ENTITY_INTENT_IDS.has(intentId)) {
    const entity = resolveEntity(q, { intentId });
    if (entity?.ok === false && entity.reason === 'clarify') return entity;
    if (entity?.ok) {
      return {
        ok: true,
        intentId: entity.intentId,
        biIntent: entity.biIntent,
        entityType: entity.entityType,
        entityId: entity.entityId,
        params: { ...entity.params },
        method: 'entity',
        confidence: entity.confidence,
      };
    }

    const params = extractParamsForIntent(q, intentId);
    if (params) {
      return buildResolution(intentId, params, 'intent', 0.88, entityMeta(intentId, params));
    }
  }

  // 4. Remaining registry matches (inventory synonyms, product SKU patterns, etc.)
  if (scored.length) {
    const tie = resolveTie(scored, q);
    if (tie?.reason === 'clarify') return tie;
    const top = scored[0];
    const resolution = buildResolution(top.intentId, top.params, top.method, top.score / 100);
    if (resolution && ENTITY_INTENT_IDS.has(top.intentId)) {
      const entity = resolveEntity(q, { intentId: top.intentId });
      if (entity?.ok) {
        resolution.entityType = entity.entityType;
        resolution.entityId = entity.entityId;
        resolution.method = 'entity';
        resolution.confidence = entity.confidence;
      }
    }
    return resolution;
  }

  const ambiguous = detectAmbiguousTerm(q);
  if (ambiguous) {
    return {
      ok: false,
      reason: 'clarify',
      clarify: {
        term: ambiguous.term,
        message: `**${ambiguous.term}** could mean a product line, department, supplier, or customer.`,
        options: ambiguous.options,
      },
      reply: formatClarifyReply({
        term: ambiguous.term,
        message: `**${ambiguous.term}** could mean a product line, department, supplier, or customer.`,
        options: ambiguous.options,
      }),
    };
  }

  return null;
}

function entityMeta(intentId, params) {
  if (intentId === 'product_lookup' && params.code) {
    return { entityType: 'product', entityId: params.code };
  }
  if (intentId === 'customer_lookup' && params.q) {
    return { entityType: 'customer', entityId: params.q };
  }
  if (intentId === 'supplier_lookup' && params.name) {
    return { entityType: 'supplier', entityId: params.name };
  }
  if (intentId === 'container_lookup' && params.reference) {
    return { entityType: 'container', entityId: params.reference };
  }
  return {};
}

function buildResolution(intentId, params, method, confidence, extra = {}) {
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
    ...extra,
  };
}

function resolveTie(scored, q) {
  const top = scored[0];
  const runnerUp = scored[1];
  if (runnerUp && top.score === runnerUp.score && top.intentId !== runnerUp.intentId) {
    return buildIntentClarify(top, runnerUp, q);
  }
  return null;
}

function scoreRegistryMatches(q) {
  /** @type {Array<{ intentId: string, score: number, method: 'exact'|'synonym', params: object }>} */
  const hits = [];

  for (const def of Object.values(INTENT_REGISTRY)) {
    if (def.id === 'sales_analysis') continue;

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
    sales_analysis: 'Best selling item today',
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
    entityType: resolved.entityType,
    entityId: resolved.entityId,
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
