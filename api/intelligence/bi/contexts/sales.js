import { executeQuery } from '../../query-engine/execute.js';
import { trustField } from '../shared/trust.js';
import { contextEnvelope, mergeContextMeta } from './_helpers.js';

const ERP_NOT_AVAILABLE = [
  'erp.top_sellers_today',
  'erp.sales_revenue',
  'erp.fast_movers',
];

/**
 * Sales Context — portal order aggregates (Capability 1.3 partial).
 * ERP POS sales queries remain backlog; website orders are evidence-backed truth.
 */
export async function buildSalesContext(params = {}, ctx = {}) {
  const scope = String(params.scope || 'top_sellers');
  const period = String(params.period || 'general');
  const query = String(params.query || '').trim();
  const limit = scope === 'worst_sellers' ? 10 : 10;

  const res = await executeQuery('portal.top_line_items', { period, scope, limit }, ctx);
  if (!res.ok) return res;

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

  const notAvailable = [...ERP_NOT_AVAILABLE];
  if (res.meta?.partial) notAvailable.push('complete_order_history');

  return contextEnvelope('sales', {
    scope,
    period,
    periodLabel,
    query,
    orderCount,
    results: items,
    top: items[0] || null,
    taught: true,
    dataSource: 'portal_orders',
    status: {
      code: hasResults ? 'ok' : 'no_orders',
      label: hasResults ? 'Portal order aggregates' : 'No orders in period',
    },
    evidence,
    notAvailable,
  }, mergeContextMeta([res.meta], {
    source: res.meta?.source || ['portal_supabase'],
    partial: Boolean(res.meta?.partial) || period === 'general',
    warnings: hasResults ? [] : ['NO_ORDERS_IN_PERIOD'],
  }), 'sales.context');
}
