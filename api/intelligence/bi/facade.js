import {
  buildProductContext,
  buildCustomerContext,
  buildSupplierContext,
  buildContainerContext,
  buildSalesContext,
  buildInventoryContext,
  buildDailyBriefContext,
} from './contexts/index.js';
import {
  formatProductContext,
  formatCustomerContext,
  formatSupplierContext,
  formatContainerContext,
  formatSalesContext,
  formatInventoryContext,
  formatDailyBriefContext,
  formatBusinessHealthSection,
  formatYesterdaySummarySection,
  formatWebsiteSummarySection,
} from './format/index.js';
import { fail } from '../query-engine/envelope.js';

const HANDLERS = {
  'brief.morning': buildDailyBriefContext,
  'product.context': buildProductContext,
  'customer.context': buildCustomerContext,
  'supplier.context': buildSupplierContext,
  'container.context': buildContainerContext,
  'sales.context': buildSalesContext,
  'inventory.context': buildInventoryContext,
  'inventory.attention': buildInventoryContext,
};

const FORMATTERS = {
  'brief.morning': formatDailyBriefContext,
  'product.context': formatProductContext,
  'customer.context': formatCustomerContext,
  'supplier.context': formatSupplierContext,
  'container.context': formatContainerContext,
  'sales.context': formatSalesContext,
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

const SECTION_FORMATTERS = {
  business_health: formatBusinessHealthSection,
  yesterday: formatYesterdaySummarySection,
  website: formatWebsiteSummarySection,
};

export function biFormat(intent, envelope, options = {}) {
  if (options.formatSection && SECTION_FORMATTERS[options.formatSection]) {
    return SECTION_FORMATTERS[options.formatSection](envelope);
  }
  const formatter = FORMATTERS[intent];
  if (!formatter) return envelope?.data ? JSON.stringify(envelope.data, null, 2) : 'No data.';
  return formatter(envelope, options);
}

export {
  buildProductContext,
  buildCustomerContext,
  buildSupplierContext,
  buildContainerContext,
  buildSalesContext,
  buildInventoryContext,
  buildDailyBriefContext,
  buildDailyBriefContext as buildMorningBrief,
};

export {
  formatProductContext,
  formatCustomerContext,
  formatSupplierContext,
  formatContainerContext,
  formatSalesContext,
  formatInventoryContext,
  formatDailyBriefContext,
  formatDailyBriefContext as formatMorningBriefMarkdown,
};
