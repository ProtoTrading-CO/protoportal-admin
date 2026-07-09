/** Intent-first classification helpers (Capability 1.1A). */

import {
  extractSku,
  detectProductEntity,
  detectCustomerEntity,
  detectSupplierEntity,
  detectContainerEntity,
  normalizeQuery,
} from '../entity-registry/detect.js';

export const SALES_ANALYSIS_RE = /(?:best|top)\s+sell(?:ing|er)|most\s+sold|highest\s+sales|fast\s+movers?|worst\s+sell(?:ing|er)|today'?s\s+sales|sales\s+today|revenue\s+today|sales\s+yesterday|last\s+week(?:'s)?\s+sales/i;

export const ENTITY_INTENT_IDS = new Set([
  'product_lookup',
  'customer_lookup',
  'supplier_lookup',
  'container_lookup',
]);

export function matchesSalesAnalysis(query) {
  return SALES_ANALYSIS_RE.test(normalizeQuery(query));
}

/**
 * @returns {{ scope?: string, period?: string, channel?: string, query?: string }}
 */
export function parseSalesParams(query) {
  const q = normalizeQuery(query);
  let period = 'general';
  if (/today/i.test(q)) period = 'today';
  else if (/yesterday/i.test(q)) period = 'yesterday';
  else if (/last\s+week/i.test(q)) period = 'last_week';

  let scope = 'top_sellers';
  if (/worst/i.test(q)) scope = 'worst_sellers';
  else if (/fast\s+mover/i.test(q)) scope = 'fast_movers';
  else if (/revenue/i.test(q)) scope = 'revenue';
  else if (/growth/i.test(q)) scope = 'growth';

  let channel = 'positill';
  if (/\b(?:website|portal|online(?:\s+orders?)?|web\s+sales|protoportal)\b/i.test(q)) {
    channel = 'website';
  }

  return { scope, period, channel, query: q };
}

/**
 * Determine business intent before entity resolution.
 * @param {string} query
 * @returns {string|null} intentId
 */
export function classifyEntityIntent(query) {
  const q = normalizeQuery(query);
  if (!q) return null;

  if (matchesSalesAnalysis(q)) return 'sales_analysis';

  const sku = extractSku(q);
  if (sku) {
    if (detectProductEntity(q)) return 'product_lookup';
    if (/^\d{8,14}[?.!]*$/.test(q)) return 'product_lookup';
  }

  if (detectContainerEntity(q)) return 'container_lookup';

  const tellAbout = q.match(/^tell me about\s+(.+)$/i);
  if (tellAbout) {
    const subject = tellAbout[1].replace(/[?.!]+$/, '').trim();
    if (matchesSalesAnalysis(subject)) return 'sales_analysis';
    if (extractSku(subject) || /^sku\s+\d{8,14}/i.test(subject)) return 'product_lookup';
    if (/^container\s*#?\s*\d+/i.test(subject)) return 'container_lookup';
    if (/^supplier\s+/i.test(subject) || looksLikeSupplierSubject(subject)) return 'supplier_lookup';
    if (looksLikeProductTitleSubject(subject)) return 'product_lookup';
    if (looksLikeCustomerSubject(subject)) return 'customer_lookup';
    return null;
  }

  if (/^(?:show|find|lookup|look\s*up)\s+supplier\s+/i.test(q) || /^supplier\s+/i.test(q)) {
    return 'supplier_lookup';
  }
  if (/^(?:show|find|lookup|look\s*up)\s+customer\s+/i.test(q) || /^customer\s+/i.test(q)) {
    return 'customer_lookup';
  }
  if (/^(?:show|find|lookup|look\s*up)\s+(?:product|sku)\s+/i.test(q) || /^sku\s+\d/i.test(q)) {
    return 'product_lookup';
  }

  if (detectSupplierEntity(q)) return 'supplier_lookup';
  if (detectCustomerEntity(q)) return 'customer_lookup';

  return null;
}

/**
 * Extract route params when entity detector did not match but intent is known.
 * @returns {object|null}
 */
export function extractParamsForIntent(query, intentId) {
  const q = normalizeQuery(query);
  const tellAbout = q.match(/^tell me about\s+(.+)$/i);

  if (intentId === 'product_lookup') {
    const fromTell = tellAbout?.[1]?.match(/(?:sku\s+)?(\d{8,14})/i);
    const code = fromTell?.[1] || extractSku(q);
    if (code) return { code };
    if (tellAbout) {
      const title = tellAbout[1].replace(/[?.!]+$/, '').trim();
      if (title && looksLikeProductTitleSubject(title)) return { title };
    }
    return null;
  }

  if (intentId === 'customer_lookup') {
    if (tellAbout) {
      const term = tellAbout[1].replace(/[?.!]+$/, '').trim();
      if (term.length >= 2) return { q: term };
    }
    const m = q.match(/^(?:show|find|lookup|look\s*up)\s+customer\s+(.+)$/i)
      || q.match(/^customer\s+(.+)$/i);
    if (m) return { q: m[1].replace(/[?.!]+$/, '').trim() };
    const bare = q.replace(/[?.!]+$/, '').trim();
    if (bare && !/\s/.test(bare) && looksLikeCustomerSubject(bare)) return { q: bare };
    return null;
  }

  if (intentId === 'supplier_lookup') {
    if (tellAbout) {
      const term = tellAbout[1].replace(/^(?:supplier\s+)/i, '').replace(/[?.!]+$/, '').trim();
      if (term.length >= 2) return { name: term };
    }
    const m = q.match(/^(?:show|find|lookup|look\s*up)\s+supplier\s+(.+)$/i)
      || q.match(/^supplier\s+(.+)$/i);
    if (m) return { name: m[1].replace(/[?.!]+$/, '').trim() };
    const bare = q.replace(/[?.!]+$/, '').trim();
    if (bare && !/\s/.test(bare)) return { name: bare };
    return null;
  }

  if (intentId === 'container_lookup') {
    return detectContainerEntity(q)?.params || null;
  }

  return null;
}

function looksLikeSupplierSubject(term) {
  const t = String(term || '').trim();
  if (!t || /\d{8,14}/.test(t)) return false;
  if (/^supplier\s+/i.test(t)) return true;
  if (t.toLowerCase() === 'motarro') return true;
  return /^[A-Z][A-Za-z&'.-]{5,}$/.test(t) && !/\s/.test(t);
}

function looksLikeCustomerSubject(term) {
  const t = String(term || '').trim();
  if (!t || matchesSalesAnalysis(t)) return false;
  if (/\d{8,14}/.test(t)) return false;
  if (looksLikeProductTitleSubject(t)) return false;
  if (/^(stock|order|product|website|brief|health|supplier|container|sku)$/i.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length >= 3) return false;
  if (words.length === 2) return true;
  if (/[A-Z]/.test(t) && t.length >= 4) return true;
  if (t.length >= 4 && t.length <= 20) return true;
  return false;
}

/** Product catalogue titles (e.g. "Playing Cards Animal") — not customer names. */
export function looksLikeProductTitleSubject(term) {
  const t = String(term || '').trim();
  if (!t || /\d{8,14}/.test(t)) return false;
  if (/^(?:why|how|what|when|where|should|can|could|would|tell)\b/i.test(t)) return false;
  if (/\b(this|that|these|those|it)\b/i.test(t)) return false;
  if (/[?]/.test(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length >= 3) return true;
  const productWords = new Set([
    'cards', 'card', 'animal', 'canvas', 'paint', 'paper', 'glue', 'puzzle', 'game',
    'brush', 'pen', 'pencil', 'marker', 'scissors', 'tape', 'ribbon', 'beads', 'wood',
    'leather', 'fabric', 'foam', 'spray', 'stationery', 'playing',
  ]);
  const lower = words.map((w) => w.toLowerCase());
  if (lower.some((w) => productWords.has(w))) return true;
  return false;
}
