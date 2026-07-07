import { buildMorningBrief, formatMorningBriefMarkdown } from './morning-brief.js';
import { buildProductContext, formatProductContextMarkdown } from './product-context.js';
import { buildCustomerContext, formatCustomerContextMarkdown } from './customer-context.js';
import { buildInventoryAttention, formatInventoryAttentionMarkdown } from './inventory-attention.js';
import { fail } from '../query-engine/envelope.js';

const HANDLERS = {
  'brief.morning': buildMorningBrief,
  'product.context': buildProductContext,
  'customer.context': buildCustomerContext,
  'inventory.attention': buildInventoryAttention,
};

const FORMATTERS = {
  'brief.morning': formatMorningBriefMarkdown,
  'product.context': formatProductContextMarkdown,
  'customer.context': formatCustomerContextMarkdown,
  'inventory.attention': formatInventoryAttentionMarkdown,
};

export async function biRun(intent, params = {}, ctx = {}) {
  const handler = HANDLERS[intent];
  if (!handler) {
    return fail({ code: 'UNKNOWN_INTENT', message: `Unknown BI intent: ${intent}` });
  }
  return handler(params, ctx);
}

export function biFormat(intent, envelope, options = {}) {
  const formatter = FORMATTERS[intent];
  if (!formatter) return envelope?.data ? JSON.stringify(envelope.data, null, 2) : 'No data.';
  return formatter(envelope, options);
}

export { buildMorningBrief, buildProductContext, buildCustomerContext, buildInventoryAttention };
