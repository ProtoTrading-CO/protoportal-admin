import { contextEnvelope } from './_helpers.js';

const NOT_AVAILABLE = [
  'erp.top_sellers_today',
  'erp.top_sellers_period',
  'erp.sales_revenue',
  'erp.fast_movers',
  'erp.worst_sellers',
  'portal.order_aggregates',
];

/**
 * Sales Context — Capability 1.3 backlog.
 * Returns honest "not taught" until sales queries are registered.
 */
export async function buildSalesContext(params = {}, ctx = {}) {
  const scope = String(params.scope || 'top_sellers');
  const period = String(params.period || 'general');
  const query = String(params.query || '').trim();

  return contextEnvelope('sales', {
    scope,
    period,
    query,
    results: null,
    status: { code: 'not_taught', label: 'Capability not yet taught' },
    taught: false,
    notAvailable: [...NOT_AVAILABLE],
  }, {
    source: ['apollo_intent'],
    partial: true,
    warnings: ['CAPABILITY_NOT_TAUGHT'],
  }, 'sales.context');
}
