import { executeQuery } from '../../query-engine/execute.js';
import { contextEnvelope, daysSince, mergeContextMeta } from './_helpers.js';

const NOT_AVAILABLE = [
  'outstanding_balance',
  'margin',
  'erp_departments',
  'erp_sales_history',
  'health_score',
  'lifetime_value',
];

export async function buildCustomerContext(params = {}, ctx = {}) {
  const q = String(params.q || params.email || params.name || '').trim();
  const id = String(params.id || '').trim();

  let customer = null;
  let searchRes = null;
  let idRes = null;

  if (id) {
    idRes = await executeQuery('portal.customer_by_id', { id }, ctx);
    if (!idRes.ok) return idRes;
    customer = idRes.data?.customer || null;
  } else if (q) {
    searchRes = await executeQuery('portal.customers_search', { q, limit: 5 }, ctx);
    if (!searchRes.ok) return searchRes;
    const hits = searchRes.data?.customers || [];
    if (hits.length === 1) customer = hits[0];
    else if (hits.length > 1) {
      return contextEnvelope('customer', {
        profile: null,
        contact: null,
        approval: null,
        orders: null,
        matches: hits.map(mapMatch),
        query: q,
        notAvailable: [...NOT_AVAILABLE],
      }, searchRes.meta, 'customer.context');
    }
  }

  if (!customer) {
    const meta = mergeContextMeta([idRes, searchRes]);
    return contextEnvelope('customer', {
      profile: null,
      contact: null,
      approval: null,
      orders: null,
      matches: (searchRes?.data?.customers || []).map(mapMatch),
      query: q || id,
      notAvailable: [...NOT_AVAILABLE],
    }, meta, 'customer.context');
  }

  const ordersRes = await executeQuery('portal.orders_by_customer', { customerId: customer.id, limit: 20 }, ctx);
  if (!ordersRes.ok) return ordersRes;

  const recent = ordersRes.data?.orders || [];
  const spendExVat = recent.reduce((s, o) => s + (Number(o.totalExVat) || 0), 0);
  const lastOrderAt = recent[0]?.createdAt || null;

  const context = {
    profile: {
      id: customer.id,
      name: customer.name || customer.business_name || '—',
      business: customer.business_name,
      businessType: customer.business_type,
      tier: customer.tier,
      joined: customer.created_at,
    },
    contact: {
      email: customer.email,
      phone: customer.phone,
      city: customer.city,
      province: customer.province,
    },
    approval: {
      approved: Boolean(customer.is_approved),
      status: customer.is_approved ? 'approved' : 'pending',
    },
    orders: {
      recent,
      count: recent.length,
      spendExVat,
      daysSinceLastOrder: daysSince(lastOrderAt),
      lastOrderAt,
    },
    matches: [],
    query: q || id,
    notAvailable: [...NOT_AVAILABLE],
  };

  const meta = mergeContextMeta([idRes, searchRes, ordersRes]);
  return contextEnvelope('customer', context, meta, 'customer.context');
}

/** Pending customers for Daily Brief / customer alerts — reuses same query, alert shape. */
export async function buildCustomerAlertsContext(params = {}, ctx = {}) {
  const limit = Math.min(25, Math.max(1, Number(params.limit) || 25));
  const res = await executeQuery('portal.customers_pending', { limit }, ctx);
  if (!res.ok) return res;

  const pending = (res.data?.customers || []).map((c) => ({
    id: c.id,
    name: c.business_name || c.name || '—',
    email: c.email,
    business: c.business_name,
    city: c.city,
    createdAt: c.created_at,
    reason: 'awaiting_approval',
    severity: 'medium',
  }));

  return contextEnvelope('customer_alerts', {
    pending,
    count: pending.length,
    notAvailable: ['erp_sales_history', 'outstanding_balance'],
  }, res.meta, 'customer.alerts');
}

function mapMatch(c) {
  return {
    id: c.id,
    name: c.business_name || c.name,
    email: c.email,
    city: c.city,
  };
}
