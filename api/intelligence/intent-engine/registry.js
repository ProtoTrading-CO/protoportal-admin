/**
 * Apollo Intent Registry — maps business intents to BI contexts.
 * Deterministic routing only; no LLM.
 */

/** @typedef {'daily_brief'|'product_lookup'|'customer_lookup'|'inventory_attention'|'business_health'|'yesterday_summary'|'website_summary'} BusinessIntentId */

/**
 * @typedef {object} IntentDefinition
 * @property {BusinessIntentId} id
 * @property {string} biIntent — facade handler key
 * @property {string} [formatSection] — partial daily-brief format
 * @property {RegExp[]} exact — anchored / high-confidence phrases
 * @property {RegExp[]} synonyms — phrase patterns (lower weight)
 * @property {number} priority — tie-breaker (higher wins)
 * @property {(query: string) => object|null} [paramsFromQuery]
 */

/** @type {Record<BusinessIntentId, IntentDefinition>} */
export const INTENT_REGISTRY = {
  daily_brief: {
    id: 'daily_brief',
    biIntent: 'brief.morning',
    exact: [
      /^what needs (my )?attention(\s+today)?[?.!]*$/i,
      /^what deserves (my )?attention(\s+today)?[?.!]*$/i,
      /^morning brief(ing)?[?.!]*$/i,
      /^daily brief(ing)?[?.!]*$/i,
      /^what should i focus on(\s+today)?[?.!]*$/i,
      /^(what's|what is) important today[?.!]*$/i,
      /^give me today'?s briefing[?.!]*$/i,
      /^today'?s briefing[?.!]*$/i,
      /^focus today[?.!]*$/i,
      /^what do i need to know today[?.!]*$/i,
    ],
    synonyms: [
      /briefing for today/i,
      /what matters today/i,
      /start my day/i,
      /open(ing)? briefing/i,
    ],
    priority: 100,
  },

  yesterday_summary: {
    id: 'yesterday_summary',
    biIntent: 'brief.morning',
    formatSection: 'yesterday',
    exact: [
      /^what changed yesterday[?.!]*$/i,
      /^since yesterday[?.!]*$/i,
      /^yesterday summary[?.!]*$/i,
      /^what happened yesterday[?.!]*$/i,
      /^orders yesterday[?.!]*$/i,
    ],
    synonyms: [
      /changes since yesterday/i,
      /yesterday'?s activity/i,
      /portal activity yesterday/i,
    ],
    priority: 90,
  },

  business_health: {
    id: 'business_health',
    biIntent: 'brief.morning',
    formatSection: 'business_health',
    exact: [
      /^business health[?.!]*$/i,
      /^how is the business(\s+doing)?[?.!]*$/i,
      /^is the business healthy[?.!]*$/i,
      /^how are we doing[?.!]*$/i,
      /^quick pulse[?.!]*$/i,
    ],
    synonyms: [
      /health of the business/i,
      /business pulse/i,
      /sales.{0,12}customers.{0,12}inventory/i,
    ],
    priority: 85,
  },

  website_summary: {
    id: 'website_summary',
    biIntent: 'brief.morning',
    formatSection: 'website',
    exact: [
      /^website summary[?.!]*$/i,
      /^website changes[?.!]*$/i,
      /^listing updates?[?.!]*$/i,
      /^what changed on the website[?.!]*$/i,
    ],
    synonyms: [
      /website listings? (updated|changed)/i,
      /catalogue changes/i,
      /site changes yesterday/i,
    ],
    priority: 80,
  },

  product_lookup: {
    id: 'product_lookup',
    biIntent: 'product.context',
    exact: [],
    synonyms: [
      /^(?:show|find|lookup|look\s*up)\s+(?:product\s+)?(\d{8,14})[?.!]*$/i,
      /^product\s+(\d{8,14})[?.!]*$/i,
      /^sku\s+(\d{8,14})[?.!]*$/i,
      /^tell me about sku\s+(\d{8,14})[?.!]*$/i,
    ],
    priority: 95,
    paramsFromQuery: (q) => {
      const m = q.match(/\b(\d{8,14})\b/);
      return m ? { code: m[1] } : null;
    },
  },

  customer_lookup: {
    id: 'customer_lookup',
    biIntent: 'customer.context',
    exact: [],
    synonyms: [],
    priority: 88,
  },

  supplier_lookup: {
    id: 'supplier_lookup',
    biIntent: 'supplier.context',
    exact: [],
    synonyms: [],
    priority: 87,
  },

  container_lookup: {
    id: 'container_lookup',
    biIntent: 'container.context',
    exact: [],
    synonyms: [],
    priority: 86,
  },

  sales_analysis: {
    id: 'sales_analysis',
    biIntent: 'sales.context',
    exact: [],
    synonyms: [
      /(?:best|top)\s+sell(?:ing|er)/i,
      /most\s+sold/i,
      /highest\s+sales/i,
      /fast\s+movers?/i,
      /worst\s+sell(?:ing|er)/i,
      /today'?s\s+sales/i,
      /sales\s+today/i,
      /revenue\s+today/i,
    ],
    priority: 94,
  },

  inventory_attention: {
    id: 'inventory_attention',
    biIntent: 'inventory.attention',
    exact: [
      /^negative stock[?.!]*$/i,
      /^low stock[?.!]*$/i,
      /^zero stock[?.!]*$/i,
      /^inventory issues?[?.!]*$/i,
      /^stock problems?[?.!]*$/i,
      /^inventory attention[?.!]*$/i,
    ],
    synonyms: [
      /products? with negative stock/i,
      /which products have negative stock/i,
      /running out of stock/i,
      /lowest stock/i,
      /stock priorities/i,
      /stock emergencies/i,
      /excess stock/i,
      /too much stock/i,
    ],
    priority: 92,
    paramsFromQuery: (q) => ({ type: inventorySubtype(q) }),
  },
};

export const BUSINESS_INTENT_IDS = Object.keys(INTENT_REGISTRY);

/** Legacy facade / apollo-experience intent ids still accepted in logs */
export const BI_INTENT_ALIASES = {
  'brief.morning': 'daily_brief',
  'product.context': 'product_lookup',
  'customer.context': 'customer_lookup',
  'supplier.context': 'supplier_lookup',
  'container.context': 'container_lookup',
  'sales.context': 'sales_analysis',
  'inventory.attention': 'inventory_attention',
  'inventory.context': 'inventory_attention',
};

function inventorySubtype(q) {
  if (/negative|below zero/i.test(q)) return 'negative';
  if (/zero stock/i.test(q)) return 'zero';
  if (/high stock|excess|too much/i.test(q)) return 'high';
  if (/low stock|lowest|running out/i.test(q)) return 'low';
  return 'all';
}

export function getIntentDefinition(intentId) {
  return INTENT_REGISTRY[intentId] || null;
}
