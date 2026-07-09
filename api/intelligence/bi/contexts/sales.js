import { executeQuery } from '../../query-engine/execute.js';
import { trustField } from '../shared/trust.js';
import { contextEnvelope, mergeContextMeta } from './_helpers.js';

const ERP_NOT_AVAILABLE = [
  'erp.sales_revenue',
  'erp.fast_movers',
  'erp.growth',
];

function effectivePeriod(period) {
  return period === 'general' ? 'general' : period;
}

/**
 * Sales Context — Positill POS by default; website portal orders only when asked.
 */
export async function buildSalesContext(params = {}, ctx = {}) {
  const scope = String(params.scope || 'top_sellers');
  const period = effectivePeriod(String(params.period || 'general'));
  const channel = String(params.channel || 'positill');
  const query = String(params.query || '').trim();
  const limit = 10;

  if (channel === 'website') {
    const portalRes = await executeQuery('portal.top_line_items', { period, scope, limit }, ctx);
    if (!portalRes.ok) return portalRes;
    return buildFromPortal(portalRes, { scope, period, query });
  }

  const erpRes = await executeQuery('erp.top_line_items', { period, scope, limit }, ctx);
  if (!erpRes.ok) return erpRes;
  return buildFromErp(erpRes, { scope, period, query });
}

function buildFromErp(res, { scope, period, query }) {
  const { items = [], invoiceHeaderCount = 0, periodLabel = period } = res.data || {};
  const ts = res.meta?.generatedAt || new Date().toISOString();
  const hasResults = items.length > 0;

  const evidence = {
    invoiceCount: trustField(invoiceHeaderCount, { source: 'erp_sql', timestamp: ts }),
    period: trustField(periodLabel, { source: 'erp_sql', timestamp: ts }),
  };

  if (items[0]) {
    evidence.topItem = trustField(
      `${items[0].name || items[0].title} (${items[0].code}) — ${items[0].totalQty} units`,
      { source: 'erp_sql', timestamp: ts },
    );
  }

  return contextEnvelope('sales', {
    scope,
    period,
    periodLabel,
    query,
    channel: 'positill',
    orderCount: invoiceHeaderCount,
    invoiceCount: invoiceHeaderCount,
    results: items,
    top: items[0] || null,
    taught: true,
    dataSource: 'positill_erp',
    status: {
      code: hasResults ? 'ok' : 'no_sales',
      label: hasResults ? 'Positill POS sales' : 'No Positill sales in period',
    },
    evidence,
    notAvailable: [...ERP_NOT_AVAILABLE],
  }, {
    ...mergeContextMeta([res.meta]),
    source: res.meta?.source || ['erp_sql'],
    partial: false,
    warnings: hasResults ? [] : ['NO_SALES_IN_PERIOD'],
  }, 'sales.context');
}

function buildFromPortal(res, { scope, period, query }) {
  const { items = [], orderCount = 0, periodLabel = period } = res.data || {};
  const ts = res.meta?.generatedAt || new Date().toISOString();
  const hasResults = items.length > 0;

  const evidence = {
    orderCount: trustField(orderCount, { source: 'portal_supabase', timestamp: ts }),
    period: trustField(periodLabel, { source: 'portal_supabase', timestamp: ts }),
  };

  if (items[0]) {
    evidence.topItem = trustField(
      `${items[0].name} (${items[0].code}) — ${items[0].totalQty} units`,
      { source: 'portal_supabase', timestamp: ts },
    );
  }

  return contextEnvelope('sales', {
    scope,
    period,
    periodLabel,
    query,
    channel: 'website',
    orderCount,
    results: items,
    top: items[0] || null,
    taught: true,
    dataSource: 'portal_orders',
    status: {
      code: hasResults ? 'ok' : 'no_orders',
      label: hasResults ? 'Website portal orders' : 'No website orders in period',
    },
    evidence,
    notAvailable: [...ERP_NOT_AVAILABLE],
  }, {
    ...mergeContextMeta([res.meta]),
    source: res.meta?.source || ['portal_supabase'],
    partial: Boolean(res.meta?.partial) || period === 'general',
    warnings: hasResults ? [] : ['NO_ORDERS_IN_PERIOD'],
  }, 'sales.context');
}
