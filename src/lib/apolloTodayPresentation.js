/** Presentation-only helpers for Apollo Today — no data fetching or business rules. */

const DISPLAY_NAMES = {
  'george@proto.co.za': 'Gee',
  'danieljoffeinfo@gmail.com': 'Daniel',
  'online@proto.co.za': 'Team',
};

export function displayNameFromEmail(email) {
  const key = String(email || '').trim().toLowerCase();
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  const local = key.split('@')[0] || '';
  if (!local) return null;
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export function greetingForHour(h) {
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function summarizeFocusItem(item) {
  const title = item.title || item.label || '';
  switch (item.type) {
    case 'negative_stock':
      return title.toLowerCase().includes('negative') ? title.charAt(0).toLowerCase() + title.slice(1) : `negative stock needs review (${title})`;
    case 'inactive_customer':
      return `${title.split(' — ')[0]} has gone quiet`;
    case 'pending_customers':
      return `${title.charAt(0).toLowerCase() + title.slice(1)}`;
    case 'orders_review':
      return `${title.charAt(0).toLowerCase() + title.slice(1)}`;
    case 'zero_stock':
      return `${title.charAt(0).toLowerCase() + title.slice(1)}`;
    case 'website_changes':
      return `${title.charAt(0).toLowerCase() + title.slice(1)}`;
    default:
      return title.charAt(0).toLowerCase() + title.slice(1);
  }
}

function healthIsCalm(health = []) {
  return health.every((h) => h.severity === 'healthy' || h.severity === 'info');
}

/**
 * Executive summary — max three sentences from existing brief context.
 * @returns {string[]}
 */
export function buildExecutiveSummary(context, { userName, hour = new Date().getHours() } = {}) {
  if (!context) return [];

  const greeting = greetingForHour(hour);
  const name = userName || 'there';
  const focus = context.focusToday || [];
  const health = context.businessHealth || [];
  const changed = context.whatChangedSinceYesterday || [];

  const sentences = [`${greeting} ${name}.`];

  if (!focus.length) {
    sentences.push(
      healthIsCalm(health)
        ? 'Proto looks healthy today — nothing urgent is flagging.'
        : 'Proto is steady, but a few areas below deserve a quick look.',
    );
    const ordersLine = changed.find((l) => l.type === 'orders');
    sentences.push(
      ordersLine?.text
        ? `${ordersLine.text.charAt(0).toUpperCase() + ordersLine.text.slice(1)}.`
        : 'Spend a minute on business health and since yesterday, then dive into operations as needed.',
    );
    return sentences.slice(0, 3);
  }

  const calm = healthIsCalm(health);
  if (calm) {
    sentences.push(
      focus.length === 1
        ? 'Proto is healthy overall, but one important issue needs your attention.'
        : `Proto is healthy overall, but ${focus.length} important issues need your attention.`,
    );
  } else {
    sentences.push(
      focus.length === 1
        ? 'There is one important issue requiring your attention today.'
        : `There are ${focus.length} important issues requiring your attention today.`,
    );
  }

  const highlights = focus.slice(0, 3).map(summarizeFocusItem);
  let detail = highlights.join(', ');
  if (focus.length > 3) detail += ', and more';
  sentences.push(`${detail.charAt(0).toUpperCase() + detail.slice(1)}.`);

  return sentences.slice(0, 3);
}

/** CRM pulse derived from existing customer alert data — no new queries. */
export function crmHealthPulse(context) {
  const pending = context?.customerAlerts?.pending?.length || 0;
  const items = context?.customerAlerts?.items || [];
  const touchpoints = items.filter((i) => i.type === 'inactive_high_value' || i.type === 'large_recent_order').length;

  if (pending) {
    return { key: 'crm', label: 'CRM', status: `${pending} approval${pending === 1 ? '' : 's'} pending`, severity: 'attention' };
  }
  if (touchpoints) {
    return { key: 'crm', label: 'CRM', status: `${touchpoints} customer${touchpoints === 1 ? '' : 's'} to follow up`, severity: 'opportunity' };
  }
  return { key: 'crm', label: 'CRM', status: 'No follow-ups flagged', severity: 'healthy' };
}

export function businessHealthWithCrm(context) {
  const base = [...(context?.businessHealth || [])];
  if (base.some((h) => h.key === 'crm')) return base;
  return [...base, crmHealthPulse(context)];
}

const FOCUS_VIEW_ALL = {
  negative_stock: 'Which products have negative stock?',
  zero_stock: 'Which products have zero stock?',
  inactive_customer: (item) => `Find customer ${String(item.title || item.label).split(' — ')[0]}`,
  pending_customers: 'Show pending customer approvals',
  orders_review: 'Orders needing review',
  website_changes: 'Morning brief',
};

export function focusViewAllQuery(item) {
  const mapped = FOCUS_VIEW_ALL[item.type];
  if (typeof mapped === 'function') return mapped(item);
  return mapped || null;
}

export function focusShowsViewAll(item) {
  const title = item.title || item.label || '';
  if (title.includes('+')) return true;
  const match = title.match(/^(\d+)\+/);
  if (match && Number(match[1]) > 1) return true;
  const countMatch = title.match(/^(\d+)\s/);
  if (countMatch && Number(countMatch[1]) > 3) return true;
  return false;
}

const FOCUS_TYPES = new Set([
  'negative_stock', 'zero_stock', 'inactive_customer', 'pending_customers', 'orders_review', 'website_changes',
]);

/** Reduce duplicate rows between Focus Today and operational cards. */
export function focusTypesPresent(focus = []) {
  return new Set(focus.map((f) => f.type).filter((t) => FOCUS_TYPES.has(t)));
}

export function filterInventoryOps(inv, focusTypes) {
  const rows = [];
  if (!focusTypes.has('negative_stock')) {
    rows.push(...(inv.negative || []).slice(0, 3).map((p) => ({ ...p, severity: 'urgent', kind: 'negative' })));
  }
  if (!focusTypes.has('zero_stock')) {
    rows.push(...(inv.zero || []).slice(0, 2).map((p) => ({ ...p, severity: 'attention', kind: 'zero', stockQty: 0 })));
  }
  rows.push(...(inv.low || []).slice(0, 2).map((p) => ({ ...p, severity: 'attention', kind: 'low' })));
  return rows.slice(0, 4);
}

export function filterCustomerOps(items, focusTypes) {
  return items.filter((item) => {
    if (focusTypes.has('pending_customers') && item.type === 'pending_approval') return false;
    if (focusTypes.has('inactive_customer') && item.type === 'inactive_high_value') return false;
    return true;
  }).slice(0, 4);
}

export function filterProductOps(items, focusTypes) {
  return items.filter((item) => {
    if (focusTypes.has('website_changes') && item.type === 'recently_updated') return false;
    if (focusTypes.has('negative_stock') && item.type === 'negative_stock') return false;
    if (focusTypes.has('zero_stock') && item.type === 'zero_stock') return false;
    return true;
  }).slice(0, 4);
}

export function buildOrderOps(context, focusTypes) {
  if (focusTypes.has('orders_review')) return [];
  return (context?.orderAlerts?.needingReview || []).slice(0, 4).map((o) => ({
    id: o.id,
    title: o.customer || `Order ${o.id}`,
    meta: o.status || 'Needs review',
    severity: 'attention',
    query: 'Orders needing review',
  }));
}

export function buildWebsiteOps(context, focusTypes) {
  if (focusTypes.has('website_changes')) return [];
  const listings = context?.yesterday?.listingsUpdated || [];
  return listings.slice(0, 4).map((p) => ({
    sku: p.sku,
    title: p.title || p.sku,
    meta: 'Updated yesterday',
    severity: 'info',
    query: `Show product ${p.sku}`,
  }));
}
