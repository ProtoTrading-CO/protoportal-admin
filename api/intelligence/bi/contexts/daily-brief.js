import { executeQuery } from '../../query-engine/execute.js';
import { contextEnvelope, mergeContextMeta } from './_helpers.js';
import { buildInventoryContext } from './inventory.js';
import { buildCustomerAlertsContext } from './customer.js';
import { startOfToday, startOfYesterday } from '../shared/format.js';

const REVIEW_STATUSES = new Set(['pending', 'order in progress']);

export async function buildDailyBriefContext(ctx = {}) {
  const yesterday = startOfYesterday();
  const today = startOfToday();
  const qCtx = { ...ctx, bypassCache: ctx.bypassCache };

  const [
    ordersRes,
    listingsRes,
    inventoryEnv,
    customerAlertsEnv,
  ] = await Promise.all([
    executeQuery('portal.orders_recent', { limit: 100 }, qCtx),
    executeQuery('stock.listings_since', { since: yesterday.toISOString(), limit: 50 }, qCtx),
    buildInventoryContext({ type: 'all', limit: 10, threshold: 10 }, qCtx),
    buildCustomerAlertsContext({ limit: 25 }, qCtx),
  ]);

  if (!ordersRes.ok) return ordersRes;
  if (!listingsRes.ok) return listingsRes;
  if (!inventoryEnv.ok) return inventoryEnv;
  if (!customerAlertsEnv.ok) return customerAlertsEnv;

  const orders = ordersRes.data?.orders || [];
  const ordersYesterday = orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= yesterday.getTime() && t < today.getTime();
  });
  const ordersYesterdayTotal = ordersYesterday.reduce((s, o) => s + (Number(o.totalExVat) || 0), 0);
  const needsReview = orders.filter((o) => REVIEW_STATUSES.has(String(o.status || '').toLowerCase()));

  const inventory = inventoryEnv.data;
  const customerAlerts = customerAlertsEnv.data;
  const listingsUpdated = listingsRes.data?.listings || [];

  const focusToday = buildFocusToday({
    inventory,
    customerAlerts,
    needsReview,
  });

  const quietSignals = buildQuietSignals({
    ordersYesterday,
    inventory,
    customerAlerts,
    needsReview,
  });

  const context = {
    yesterday: {
      orders: ordersYesterday,
      orderCount: ordersYesterday.length,
      orderTotalExVat: ordersYesterdayTotal,
      listingsUpdated,
      listingsCount: listingsUpdated.length,
    },
    focusToday,
    inventoryAlerts: {
      negative: inventory.lists.negative,
      low: inventory.lists.low,
      zero: inventory.lists.zero,
      high: inventory.lists.high,
    },
    customerAlerts: {
      pending: customerAlerts.pending,
      count: customerAlerts.count,
    },
    orderAlerts: {
      needingReview: needsReview.slice(0, 10),
      count: needsReview.length,
    },
    quietSignals,
    notAvailable: [
      'erp_sales_summary',
      'search_analytics',
      'supplier_alerts',
      'finance_ar',
    ],
  };

  const meta = mergeContextMeta([
    ordersRes,
    listingsRes,
    inventoryEnv,
    customerAlertsEnv,
  ]);

  return contextEnvelope('daily_brief', context, meta, 'brief.morning');
}

function buildFocusToday({ inventory, customerAlerts, needsReview }) {
  const focus = [];
  const neg = inventory.lists.negative || [];
  const zero = inventory.lists.zero || [];
  const pending = customerAlerts.pending || [];

  if (neg.length) {
    focus.push({
      type: 'negative_stock',
      priority: 1,
      label: `${neg.length}+ products with negative stock`,
      detail: neg[0] ? `${neg[0].title} (${neg[0].sku}) at ${neg[0].stockQty}` : '',
    });
  }
  if (pending.length) {
    focus.push({
      type: 'pending_customers',
      priority: 2,
      label: `${pending.length} customer${pending.length === 1 ? '' : 's'} awaiting approval`,
      detail: pending[0] ? `${pending[0].name} — ${pending[0].email}` : '',
    });
  }
  if (needsReview.length) {
    focus.push({
      type: 'orders_review',
      priority: 3,
      label: `${needsReview.length} recent order${needsReview.length === 1 ? '' : 's'} need review`,
      detail: needsReview[0] ? `${needsReview[0].customer} · ${needsReview[0].status}` : '',
    });
  }
  if (zero.length) {
    focus.push({
      type: 'zero_stock',
      priority: 4,
      label: `${zero.length}+ live listings at zero stock`,
      detail: zero[0] ? `${zero[0].title} (${zero[0].sku})` : '',
    });
  }

  return focus.sort((a, b) => a.priority - b.priority);
}

function buildQuietSignals({ ordersYesterday, inventory, customerAlerts, needsReview }) {
  const notes = [];
  if (!ordersYesterday.length) notes.push('No new portal orders yesterday.');
  const neg = inventory.lists.negative || [];
  const low = inventory.lists.low || [];
  if (!neg.length && !low.length) notes.push('No urgent stock emergencies in linked listings.');
  if (!customerAlerts.pending?.length) notes.push('No customers waiting for approval.');
  if (!needsReview.length) notes.push('No orders flagged for immediate review.');
  return notes;
}

/** @deprecated use buildDailyBriefContext */
export const buildMorningBrief = buildDailyBriefContext;
