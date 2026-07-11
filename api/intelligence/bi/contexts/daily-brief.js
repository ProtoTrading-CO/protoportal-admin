import { executeQuery } from '../../query-engine/execute.js';
import { contextEnvelope, daysSince, mergeContextMeta } from './_helpers.js';
import { buildInventoryContext } from './inventory.js';
import { buildCustomerAlertsContext } from './customer.js';
import { startOfToday, startOfYesterday } from '../shared/format.js';
import { getPortalAdminClient } from '../../../_site-config.js';
import { generateApolloNotifications, loadDailyBriefValidationScore } from '../../../apollo-notifications.js';
import { notificationToFocus } from '../../../_apollo-notifications-core.js';
import { summarizeNegativeStock } from '../../../_apollo-negative-stock-rules.js';

const REVIEW_STATUSES = new Set(['pending', 'order in progress']);
const LARGE_ORDER_ZAR = 10_000;
const INACTIVE_DAYS = 60;
const INACTIVE_MIN_SPEND = 5_000;

export async function buildDailyBriefContext(ctx = {}) {
  const yesterday = startOfYesterday();
  const today = startOfToday();
  const qCtx = { ...ctx, bypassCache: ctx.bypassCache };

  const [
    ordersRes,
    listingsRes,
    inventoryEnv,
    customerAlertsEnv,
    notificationsEnv,
    validationScoreEnv,
  ] = await Promise.all([
    executeQuery('portal.orders_recent', { limit: 100 }, qCtx),
    executeQuery('stock.listings_since', { since: yesterday.toISOString(), limit: 50 }, qCtx),
    buildInventoryContext({ type: 'all', limit: 10, threshold: 10 }, qCtx),
    buildCustomerAlertsContext({ limit: 25 }, qCtx),
    loadOperationalNotifications(),
    loadValidationScore(),
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
  const notifications = notificationsEnv;
  const listingsUpdated = listingsRes.data?.listings || [];

  const customerInsights = buildCustomerInsights(orders);
  const productItems = buildProductItems(listingsUpdated, inventory);
  const customerItems = buildCustomerItems(customerAlerts, customerInsights, ordersYesterday);
  const combinedNotifications = {
    items: [...(notifications.items || [])]
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0)),
  };
  combinedNotifications.counts = countNotifications(combinedNotifications.items);
  combinedNotifications.businessHealthScore = scoreNotifications(combinedNotifications.items);

  const notificationFocus = (combinedNotifications.items || [])
    .slice(0, 4)
    .map((item, index) => notificationToFocus(item, index + 1));

  const focusToday = [
    ...notificationFocus,
    ...buildFocusToday({
    inventory,
    customerAlerts,
    needsReview,
    customerInsights,
    listingsUpdated,
    }).map((item) => ({ ...item, priority: item.priority + notificationFocus.length })),
  ].slice(0, 5);

  const quietSignals = buildQuietSignals({
    ordersYesterday,
    inventory,
    customerAlerts,
    needsReview,
  });

  const whatChangedSinceYesterday = buildWhatChangedSinceYesterday({
    ordersYesterday,
    ordersYesterdayTotal,
    listingsUpdated,
    customerAlerts,
  });

  const businessHealth = buildBusinessHealth({
    ordersYesterday,
    ordersYesterdayTotal,
    customerAlerts,
    inventory,
    needsReview,
    listingsUpdated,
    notifications,
    combinedNotifications,
  });

  const context = {
    whatChangedSinceYesterday,
    businessHealth,
    yesterday: {
      orders: ordersYesterday,
      orderCount: ordersYesterday.length,
      orderTotalExVat: ordersYesterdayTotal,
      listingsUpdated,
      listingsCount: listingsUpdated.length,
      summary: buildYesterdaySummary(ordersYesterday, listingsUpdated, customerAlerts),
    },
    focusToday,
    notifications: {
      guidingQuestion: 'What changed that I would not have noticed?',
      businessHealthScore: combinedNotifications.businessHealthScore,
      counts: combinedNotifications.counts,
      items: combinedNotifications.items.slice(0, 20),
    },
    inventoryAlerts: {
      negative: inventory.lists.negative,
      low: inventory.lists.low,
      zero: inventory.lists.zero,
      high: inventory.lists.high,
    },
    customerAlerts: {
      pending: customerAlerts.pending,
      count: customerAlerts.count,
      items: customerItems,
    },
    productAlerts: {
      items: productItems,
    },
    orderAlerts: {
      needingReview: needsReview.slice(0, 10),
      count: needsReview.length,
      largeRecent: customerInsights.largeRecent,
      notifications: combinedNotifications.items.filter((item) => item.category?.includes('order')).slice(0, 10),
    },
    buyingAlerts: {
      items: combinedNotifications.items.filter((item) => item.category === 'buying_review_due').slice(0, 10),
    },
    supplierAlerts: {
      items: combinedNotifications.items.filter((item) => item.category === 'supplier_followups').slice(0, 10),
    },
    exceptionAlerts: {
      items: combinedNotifications.items.filter((item) => item.payload?.release === 'apollo-operational-v1.2').slice(0, 10),
    },
    validationScore: validationScoreEnv,
    quietSignals,
    workspaces: {
      tabs: [
        { id: 'today', label: 'Today', active: true },
        { id: 'customers', label: 'Customers', comingSoon: true },
        { id: 'products', label: 'Products', comingSoon: true },
        { id: 'inventory', label: 'Inventory', comingSoon: true },
        { id: 'buying', label: 'Buying', comingSoon: true },
        { id: 'suppliers', label: 'Suppliers', comingSoon: true },
      ],
      available: ['inventory', 'customer', 'product'],
      comingSoon: ['supplier', 'buying', 'sales'],
    },
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
    { meta: { source: ['apollo_notifications'], generatedAt: new Date().toISOString(), warnings: [] } },
  ]);

  return contextEnvelope('daily_brief', context, meta, 'brief.morning');
}

async function loadValidationScore() {
  try {
    return await loadDailyBriefValidationScore(getPortalAdminClient());
  } catch (err) {
    console.warn('daily-brief validation score unavailable:', err?.message || err);
    return null;
  }
}

async function loadOperationalNotifications() {
  try {
    return await generateApolloNotifications({
      supabase: getPortalAdminClient(),
      persist: true,
      includeAdvisory: true,
    });
  } catch (err) {
    console.warn('daily-brief notifications unavailable:', err?.message || err);
    return {
      items: [],
      counts: { total: 0, urgent: 0, attention: 0, byCategory: {} },
      businessHealthScore: 10,
    };
  }
}

function countNotifications(items = []) {
  const counts = { total: items.length, urgent: 0, attention: 0, critical: 0, action: 0, review: 0, byCategory: {}, bySeverity: {} };
  for (const item of items) {
    if (item.severity === 'urgent' || item.severity === 'critical') counts.urgent += 1;
    if (['attention', 'review', 'action'].includes(item.severity)) counts.attention += 1;
    if (item.severity === 'critical') counts.critical += 1;
    if (item.severity === 'action') counts.action += 1;
    if (item.severity === 'review') counts.review += 1;
    counts.byCategory[item.category] = (counts.byCategory[item.category] || 0) + 1;
    counts.bySeverity[item.severity] = (counts.bySeverity[item.severity] || 0) + 1;
  }
  return counts;
}

function scoreNotifications(items = []) {
  const penalty = items.reduce((sum, item) => {
    if (item.severity === 'critical') return sum + 0.6;
    if (item.severity === 'urgent' || item.severity === 'action') return sum + 0.45;
    if (item.severity === 'attention' || item.severity === 'review') return sum + 0.22;
    return sum + 0.08;
  }, 0);
  return Math.max(0, Math.round((10 - penalty) * 10) / 10);
}

function buildWhatChangedSinceYesterday({ ordersYesterday, ordersYesterdayTotal, listingsUpdated, customerAlerts }) {
  const lines = [];

  if (ordersYesterday.length) {
    const total = ordersYesterdayTotal
      ? ` · R ${Math.round(ordersYesterdayTotal).toLocaleString('en-ZA')} ex VAT`
      : '';
    lines.push({
      type: 'orders',
      text: `${ordersYesterday.length} portal order${ordersYesterday.length === 1 ? '' : 's'} received${total}`,
      severity: 'info',
    });
  } else {
    lines.push({ type: 'orders', text: 'No portal orders yesterday', severity: 'healthy' });
  }

  if (listingsUpdated.length) {
    lines.push({
      type: 'listings',
      text: `${listingsUpdated.length} website listing${listingsUpdated.length === 1 ? '' : 's'} updated`,
      severity: 'info',
    });
  }

  const pending = customerAlerts.pending?.length || 0;
  if (pending) {
    lines.push({
      type: 'approvals',
      text: `${pending} customer${pending === 1 ? '' : 's'} awaiting approval`,
      severity: 'attention',
    });
  }

  if (!lines.some((l) => l.type === 'listings') && !pending && !ordersYesterday.length) {
    lines.push({ type: 'quiet', text: 'Quiet day across portal and website', severity: 'healthy' });
  }

  return lines;
}

function buildBusinessHealth({ ordersYesterday, ordersYesterdayTotal, customerAlerts, inventory, needsReview, listingsUpdated, combinedNotifications }) {
  const neg = (inventory.lists.negative || []).length;
  const low = (inventory.lists.low || []).length;
  const zero = (inventory.lists.zero || []).length;
  const invAlerts = neg + low + zero;
  const pending = customerAlerts.pending?.length || 0;
  const review = needsReview.length;

  const salesStatus = ordersYesterday.length
    ? `${ordersYesterday.length} order${ordersYesterday.length === 1 ? '' : 's'} yesterday`
    : 'Quiet';
  const salesHint = ordersYesterdayTotal
    ? `R ${Math.round(ordersYesterdayTotal).toLocaleString('en-ZA')} ex VAT`
    : null;

  let customerStatus = 'All clear';
  let customerSeverity = 'healthy';
  if (pending) {
    customerStatus = `${pending} pending approval`;
    customerSeverity = 'attention';
  } else if (review) {
    customerStatus = `${review} order${review === 1 ? '' : 's'} to review`;
    customerSeverity = 'attention';
  }

  let inventoryStatus = 'Stable';
  let inventorySeverity = 'healthy';
  const negativeSummary = summarizeNegativeStock(inventory.lists?.negative || []);
  if (negativeSummary.investigate.length) {
    inventoryStatus = `${negativeSummary.investigate.length} stock discrepanc${negativeSummary.investigate.length === 1 ? 'y' : 'ies'} need investigation`;
    inventorySeverity = 'urgent';
  } else if (negativeSummary.timing.length) {
    inventoryStatus = `${negativeSummary.timing.length} product${negativeSummary.timing.length === 1 ? '' : 's'} awaiting GRV`;
    inventorySeverity = 'info';
  } else if (invAlerts) {
    inventoryStatus = `${invAlerts} stock alert${invAlerts === 1 ? '' : 's'}`;
    inventorySeverity = 'attention';
  }

  const websiteStatus = listingsUpdated.length
    ? `${listingsUpdated.length} listing change${listingsUpdated.length === 1 ? '' : 's'}`
    : 'No changes';
  const websiteSeverity = listingsUpdated.length ? 'info' : 'healthy';

  const notifCount = combinedNotifications?.counts?.total || 0;
  const urgent = combinedNotifications?.counts?.urgent || 0;
  const exceptions = (combinedNotifications?.items || []).filter((item) => item.payload?.release === 'apollo-operational-v1.2').length;
  let memoryStatus = 'Nothing at risk';
  let memorySeverity = 'healthy';
  if (urgent) {
    memoryStatus = `${urgent} urgent item${urgent === 1 ? '' : 's'}`;
    memorySeverity = 'urgent';
  } else if (exceptions) {
    memoryStatus = `${exceptions} exception${exceptions === 1 ? '' : 's'} noticed`;
    memorySeverity = 'attention';
  } else if (notifCount) {
    memoryStatus = `${notifCount} item${notifCount === 1 ? '' : 's'} to remember`;
    memorySeverity = 'attention';
  }

  return [
    { key: 'sales', label: 'Sales', status: salesStatus, hint: salesHint, severity: ordersYesterday.length ? 'healthy' : 'info' },
    { key: 'customers', label: 'Customers', status: customerStatus, severity: customerSeverity },
    { key: 'inventory', label: 'Inventory', status: inventoryStatus, severity: inventorySeverity },
    { key: 'website', label: 'Website', status: websiteStatus, severity: websiteSeverity },
    { key: 'memory', label: 'Memory', status: memoryStatus, hint: combinedNotifications?.businessHealthScore != null ? `${combinedNotifications.businessHealthScore}/10` : null, severity: memorySeverity },
  ];
}

function buildYesterdaySummary(ordersYesterday, listingsUpdated, customerAlerts) {
  const lines = [];
  if (ordersYesterday.length) {
    lines.push({ type: 'orders', label: `${ordersYesterday.length} order${ordersYesterday.length === 1 ? '' : 's'}`, severity: 'info' });
  }
  if (listingsUpdated.length) {
    lines.push({ type: 'listings', label: `${listingsUpdated.length} listing${listingsUpdated.length === 1 ? '' : 's'} updated`, severity: 'info' });
  }
  if (customerAlerts.pending?.length) {
    lines.push({ type: 'approvals', label: `${customerAlerts.pending.length} pending approval`, severity: 'attention' });
  }
  return lines;
}

function buildCustomerInsights(orders) {
  const byCustomer = new Map();
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;

  for (const o of orders) {
    if (!o.customerId) continue;
    const prev = byCustomer.get(o.customerId) || {
      customerId: o.customerId,
      customer: o.customer,
      lastAt: o.createdAt,
      spend: 0,
      count: 0,
    };
    prev.spend += Number(o.totalExVat) || 0;
    prev.count += 1;
    if (new Date(o.createdAt) > new Date(prev.lastAt)) {
      prev.lastAt = o.createdAt;
      prev.customer = o.customer;
    }
    byCustomer.set(o.customerId, prev);
  }

  const inactiveHighValue = [...byCustomer.values()]
    .map((c) => ({ ...c, daysSince: daysSince(c.lastAt) }))
    .filter((c) => c.daysSince >= INACTIVE_DAYS && c.spend >= INACTIVE_MIN_SPEND)
    .sort((a, b) => b.spend - a.spend);

  const largeRecent = orders
    .filter((o) => new Date(o.createdAt).getTime() >= sevenDaysAgo && Number(o.totalExVat) >= LARGE_ORDER_ZAR)
    .sort((a, b) => Number(b.totalExVat) - Number(a.totalExVat))
    .slice(0, 5)
    .map((o) => ({
      id: o.id,
      customer: o.customer,
      totalExVat: o.totalExVat,
      createdAt: o.createdAt,
      status: o.status,
    }));

  return { inactiveHighValue, largeRecent };
}

function buildProductItems(listingsUpdated, inventory) {
  const items = [];

  for (const p of listingsUpdated.slice(0, 4)) {
    items.push({
      type: 'recently_updated',
      sku: p.sku,
      title: p.title || p.sku,
      severity: 'info',
      reason: 'Website listing changed yesterday',
      workspace: 'product',
    });
  }

  for (const p of (inventory.lists.negative || []).slice(0, 3)) {
    items.push({
      type: 'negative_stock',
      sku: p.sku,
      title: p.title,
      stockQty: p.stockQty,
      severity: 'urgent',
      reason: 'Stock below zero on live listing',
      workspace: 'inventory',
    });
  }

  for (const p of (inventory.lists.zero || []).slice(0, 2)) {
    items.push({
      type: 'zero_stock',
      sku: p.sku,
      title: p.title,
      severity: 'attention',
      reason: 'Live on website with no stock',
      workspace: 'inventory',
    });
  }

  return items.slice(0, 8);
}

function buildCustomerItems(customerAlerts, customerInsights, ordersYesterday) {
  const items = [];

  for (const c of (customerAlerts.pending || []).slice(0, 4)) {
    items.push({
      type: 'pending_approval',
      id: c.id,
      name: c.name,
      email: c.email,
      severity: 'attention',
      reason: 'Awaiting trade account approval',
      action: 'Review application and approve or decline',
      workspace: 'customer',
    });
  }

  const inactive = customerInsights.inactiveHighValue[0];
  if (inactive) {
    items.push({
      type: 'inactive_high_value',
      customerId: inactive.customerId,
      name: inactive.customer,
      daysSince: inactive.daysSince,
      spendExVat: inactive.spend,
      severity: 'attention',
      reason: `No portal order in ${inactive.daysSince} days`,
      action: 'Call or email — high-value customer going quiet',
      workspace: 'customer',
    });
  }

  for (const o of customerInsights.largeRecent.slice(0, 2)) {
    items.push({
      type: 'large_recent_order',
      orderId: o.id,
      name: o.customer,
      totalExVat: o.totalExVat,
      severity: 'info',
      reason: 'Large order in the last 7 days',
      action: 'Confirm fulfilment and follow up',
      workspace: 'customer',
    });
  }

  for (const o of ordersYesterday.slice(0, 2)) {
    items.push({
      type: 'order_yesterday',
      orderId: o.id,
      name: o.customer,
      totalExVat: o.totalExVat,
      severity: 'info',
      reason: 'Order received yesterday',
      workspace: 'customer',
    });
  }

  return items.slice(0, 8);
}

function buildFocusToday({ inventory, customerAlerts, needsReview, customerInsights, listingsUpdated = [], sales = null }) {
  const focus = [];
  const neg = inventory.lists.negative || [];
  const zero = inventory.lists.zero || [];
  const pending = customerAlerts.pending || [];
  const inactive = customerInsights.inactiveHighValue[0];
  const negativeSummary = summarizeNegativeStock(neg, { sales });

  if (negativeSummary.investigate.length) {
    const first = negativeSummary.investigate[0];
    const count = negativeSummary.investigate.length;
    const title = count === 1
      ? `${first.code} · stock discrepancy needs investigation`
      : `${count} products need inventory investigation`;
    focus.push({
      type: 'negative_stock_investigation',
      priority: 1,
      severity: 'urgent',
      title,
      label: title,
      detail: first.detail,
      why: first.recommendation,
      action: 'Investigate inventory and reconcile stock with GRV history.',
      workspace: 'inventory',
      payload: { negativeStockClass: 'investigate', code: first.code },
    });
  }

  if (inactive) {
    const title = `${inactive.customer} — quiet for ${inactive.daysSince} days`;
    focus.push({
      type: 'inactive_customer',
      priority: 2,
      severity: 'attention',
      title,
      label: title,
      detail: `R ${Math.round(inactive.spend).toLocaleString('en-ZA')} in loaded portal orders`,
      why: 'High-value customers who stop ordering are easy to miss.',
      action: 'Call or email to check in before they shop elsewhere.',
      workspace: 'customer',
    });
  }

  if (pending.length) {
    const title = `${pending.length} customer${pending.length === 1 ? '' : 's'} awaiting approval`;
    focus.push({
      type: 'pending_customers',
      priority: 3,
      severity: 'attention',
      title,
      label: title,
      detail: pending[0] ? `${pending[0].name} — ${pending[0].email}` : '',
      why: 'New trade accounts are waiting to buy from you.',
      action: 'Review and approve legitimate applications.',
      workspace: 'customer',
    });
  }

  if (needsReview.length) {
    const title = `${needsReview.length} order${needsReview.length === 1 ? '' : 's'} need review`;
    focus.push({
      type: 'orders_review',
      priority: 4,
      severity: 'attention',
      title,
      label: title,
      detail: needsReview[0] ? `${needsReview[0].customer} · ${needsReview[0].status}` : '',
      why: 'Pending orders block fulfilment and customer satisfaction.',
      action: 'Open Order Requests and advance workflow.',
      workspace: 'sales',
    });
  }

  if (listingsUpdated.length >= 3 && focus.length < 5) {
    const title = `${listingsUpdated.length} website listings changed yesterday`;
    focus.push({
      type: 'website_changes',
      priority: 5,
      severity: 'info',
      title,
      label: title,
      detail: listingsUpdated[0] ? `${listingsUpdated[0].title} (${listingsUpdated[0].sku})` : '',
      why: 'Catalogue changes may need pricing or stock review.',
      action: 'Spot-check updated listings for accuracy.',
      workspace: 'product',
    });
  } else if (zero.length && focus.length < 5) {
    const title = `${zero.length}+ live listings at zero stock`;
    focus.push({
      type: 'zero_stock',
      priority: 5,
      severity: 'attention',
      title,
      label: title,
      detail: zero[0] ? `${zero[0].title} (${zero[0].sku})` : '',
      why: 'Customers can see products they cannot buy.',
      action: 'Reorder, hide listing, or mark out of stock.',
      workspace: 'inventory',
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
