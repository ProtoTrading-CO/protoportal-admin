import {
  buildProductContext,
  buildCustomerContext,
  buildInventoryContext,
  buildDailyBriefContext,
} from './contexts/index.js';
import {
  formatProductContext,
  formatCustomerContext,
  formatInventoryContext,
  formatDailyBriefContext,
} from './format/index.js';
import { fail } from '../query-engine/envelope.js';

const HANDLERS = {
  'brief.morning': buildDailyBriefContext,
  'product.context': buildProductContext,
  'customer.context': buildCustomerContext,
  'inventory.context': buildInventoryContext,
  'inventory.attention': buildInventoryContext,
};

const FORMATTERS = {
  'brief.morning': formatDailyBriefContext,
  'product.context': formatProductContext,
  'customer.context': formatCustomerContext,
  'inventory.context': formatInventoryContext,
  'inventory.attention': formatInventoryContext,
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

export {
  buildProductContext,
  buildCustomerContext,
  buildInventoryContext,
  buildDailyBriefContext,
  buildDailyBriefContext as buildMorningBrief,
};

export {
  formatProductContext,
  formatCustomerContext,
  formatInventoryContext,
  formatDailyBriefContext,
  formatDailyBriefContext as formatMorningBriefMarkdown,
};
