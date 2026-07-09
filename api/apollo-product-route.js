/**
 * Capability 1.1A — wire Apollo Chat to Product Context (not keyword index).
 */
import { extractSku } from './intelligence/entity-registry/detect.js';
import { looksLikeProductTitleSubject } from './intelligence/intent-engine/classify.js';
import { resolveIntent, resolutionToRoute } from './apollo-experience.js';
import { biRun, biFormat } from './intelligence/bi/facade.js';
import { getApolloData, searchIndex } from './apollo-data.js';
import { searchCacheByTitle, scoreTitleMatch } from './_stmast-cache.js';

const SKU_ONLY_RE = /^\d{8,14}[?.!]*$/i;

/** Queries that must never hit the keyword index first. */
export function isSkuProductQuery(query) {
  const q = String(query || '').trim();
  const sku = extractSku(q);
  if (!sku) return false;
  return (
    SKU_ONLY_RE.test(q)
    || /^(?:show|find|lookup|look\s*up)\s+(?:product|sku)\s+\d{8,14}/i.test(q)
    || /^product\s+\d{8,14}/i.test(q)
    || /^sku\s+\d{8,14}/i.test(q)
    || /tell me about\s+(?:sku\s+)?\d{8,14}/i.test(q)
  );
}

export async function resolveTitleToSku(title) {
  const term = String(title || '').trim();
  if (!term) return null;

  /** @type {Array<{ code: string, title: string, score: number }>} */
  const candidates = [];

  const data = await getApolloData();
  for (const hit of searchIndex(data.index, term, { domain: 'product', limit: 8 })) {
    const code = String(hit.payload?.sku || hit.id || '').trim().toUpperCase();
    const hitTitle = hit.payload?.title || '';
    if (!code) continue;
    candidates.push({ code, title: hitTitle, score: scoreTitleMatch(term, hitTitle) });
  }

  for (const row of await searchCacheByTitle(term)) {
    candidates.push({ code: row.code, title: row.title, score: scoreTitleMatch(term, row.title) });
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].code;
}

export async function runProductContextByCode(code, actorEmail, meta = {}) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;

  const ctx = { actorEmail: actorEmail || 'apollo' };
  const envelope = await biRun('product.context', { code: normalized }, ctx);

  if (!envelope.ok) {
    return {
      reply: `## Product ${normalized}\n\nCould not load product context: ${envelope.error?.message || 'unknown error'}.`,
      source: 'product.context',
      intent: 'product.context',
      businessIntent: 'product_lookup',
      resolution: meta.resolution || { method: 'sku', confidence: 0.5 },
    };
  }

  return {
    reply: biFormat('product.context', envelope),
    source: 'product.context',
    intent: 'product.context',
    businessIntent: 'product_lookup',
    resolution: meta.resolution || { method: 'sku', confidence: 1 },
    experience: envelope.data,
  };
}

/**
 * Intent → Entity → Product Context for SKU-shaped chat messages.
 * @returns {Promise<object|null>}
 */
export async function tryProductContextRoute(userQuery, actorEmail) {
  const resolved = resolveIntent(userQuery);

  if (resolved?.ok && resolved.intentId === 'product_lookup') {
    const route = resolutionToRoute(resolved);
    const code = route?.params?.code || extractSku(userQuery);
    if (code) {
      return runProductContextByCode(code, actorEmail, {
        resolution: { method: route.method, confidence: route.confidence },
      });
    }
    if (route?.params?.title) {
      const sku = await resolveTitleToSku(route.params.title);
      if (sku) {
        return runProductContextByCode(sku, actorEmail, {
          resolution: { method: 'title', confidence: route.confidence },
        });
      }
    }
  }

  const tellAbout = String(userQuery || '').match(/^tell me about\s+(.+)$/i);
  if (tellAbout) {
    const subject = tellAbout[1].replace(/[?.!]+$/, '').trim();
    if (!extractSku(subject) && looksLikeProductTitleSubject(subject)) {
      const sku = await resolveTitleToSku(subject);
      if (sku) {
        return runProductContextByCode(sku, actorEmail, {
          resolution: { method: 'title', confidence: 0.85 },
        });
      }
    }
  }

  if (isSkuProductQuery(userQuery)) {
    const sku = extractSku(userQuery);
    if (sku) return runProductContextByCode(sku, actorEmail);
  }

  if (!extractSku(userQuery) && looksLikeProductTitleSubject(userQuery)) {
    const sku = await resolveTitleToSku(userQuery);
    if (sku) {
      return runProductContextByCode(sku, actorEmail, {
        resolution: { method: 'title', confidence: 0.8 },
      });
    }
  }

  return null;
}

/** @returns {boolean} */
export function isKeywordSearchBlockedForQuery(query, intentId, terms) {
  if (intentId !== 'product_search') return false;
  const t = String(terms || '').trim();
  if (/^\d{8,14}$/.test(t)) return true;
  return isSkuProductQuery(query);
}
