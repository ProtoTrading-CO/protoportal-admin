/** Apollo Command Centre — presentation helpers (no backend / business rules). */

import {
  summarizeBusinessRulesApplied,
} from './apolloRulebookPresentation.js';
import {
  businessHealthScore,
  displaySeverity,
  greetingForHour,
} from './apolloTodayPresentation.js';

export const OPERATIONAL_MATURITY = [
  { key: 'truth', label: 'Truth', status: 'earned' },
  { key: 'context', label: 'Context', status: 'earned' },
  { key: 'execution', label: 'Execution', status: 'earned' },
  { key: 'attention', label: 'Attention', status: 'earned' },
  { key: 'memory', label: 'Memory', status: 'emerging' },
  { key: 'reasoning', label: 'Reasoning', status: 'emerging' },
  { key: 'advice', label: 'Advice', status: 'emerging' },
];

export const QUICK_ACTIONS = [
  { id: 'order', label: 'Create Order', query: '/order ', prefix: '＋' },
  { id: 'remember', label: 'Remember', query: 'Remember ', prefix: '＋' },
  { id: 'customer', label: 'Customer', query: 'Find customer ', prefix: '＋' },
  { id: 'supplier', label: 'Supplier', query: 'Supplier follow-up ', prefix: '＋' },
  { id: 'buying', label: 'Buying', query: 'Buying advice for ', prefix: '＋' },
  { id: 'search', label: 'Search', query: 'Show product ', prefix: '＋' },
];

export const START_MY_DAY_STEPS = [
  { id: 'brief', label: 'Review Brief', target: 'apollo-cc-section-greeting' },
  { id: 'notifications', label: 'Review Notifications', target: 'apollo-cc-section-notifications' },
  { id: 'orders', label: 'Review Orders', target: 'apollo-cc-section-recommends' },
  { id: 'buying', label: 'Review Buying', target: 'apollo-cc-section-brief' },
  { id: 'done', label: 'Done', target: null },
];

function healthLabel(score) {
  if (score == null) return 'Unknown';
  if (score >= 9) return 'Excellent';
  if (score >= 8) return 'Healthy';
  if (score >= 6) return 'Needs attention';
  return 'At risk';
}

export function categorizeFocusItem(item) {
  const type = String(item.type || '').toLowerCase();
  const title = String(item.title || item.label || '').toLowerCase();
  const category = String(item.category || '').toLowerCase();
  if (
    type.includes('customer')
    || type.includes('inactive')
    || category.includes('customer')
    || category.includes('commitment')
    || title.includes('customer')
    || title.includes('quotation')
    || title.includes('quote')
  ) return 'customer';
  if (
    type.includes('supplier')
    || category.includes('supplier')
    || title.includes('supplier')
    || title.includes('motarro')
  ) return 'supplier';
  if (
    type.includes('buying')
    || type.includes('stock')
    || type.includes('inventory')
    || category.includes('buying')
    || title.includes('wallet')
    || title.includes('stock')
    || title.includes('buying')
  ) return 'buying';
  if (type.includes('order') || title.includes('container') || title.includes('order')) return 'orders';
  return 'other';
}

export const FOCUS_CATEGORY_LABELS = {
  buying: 'Buying',
  supplier: 'Supplier',
  customer: 'Customer',
  orders: 'Orders',
  other: 'Operations',
};

const FOCUS_CATEGORY_ORDER = ['buying', 'supplier', 'customer', 'orders', 'other'];

function severityRank(severity) {
  const s = displaySeverity(severity);
  if (s === 'urgent') return 0;
  if (s === 'attention') return 1;
  return 2;
}

function focusItemKey(item) {
  return String(item.title || item.label || '').trim().toLowerCase();
}

/** One focus item per responsibility area — buying, supplier, customer, etc. */
export function diverseFocusForDisplay(focus = [], limit = 3) {
  const pool = [];
  const seenTitles = new Set();
  const seenLabels = new Set();

  for (const item of focus) {
    const titleKey = focusItemKey(item);
    const labelKey = heroFocusLabel(item).trim().toLowerCase();
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (seenLabels.has(labelKey)) continue;
    if (titleKey) seenTitles.add(titleKey);
    seenLabels.add(labelKey);
    pool.push(item);
  }

  const byCategory = {};
  pool.forEach((item) => {
    const cat = categorizeFocusItem(item);
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  Object.values(byCategory).forEach((items) => {
    items.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  });

  const picked = [];
  const usedCategories = new Set();

  for (const cat of FOCUS_CATEGORY_ORDER) {
    if (picked.length >= limit) break;
    const item = byCategory[cat]?.[0];
    if (!item || usedCategories.has(cat)) continue;
    picked.push(item);
    usedCategories.add(cat);
  }

  return picked.slice(0, limit);
}

function businessStatusHeadline(label, emoji) {
  const map = {
    Excellent: 'Very healthy',
    Healthy: 'Healthy',
    'Needs attention': 'Needs attention',
    'At risk': 'Under pressure',
    Unknown: 'Status unknown',
  };
  return `${emoji} Business ${map[label] || label}`;
}

function countSupplierAttention(context, focusPool) {
  const notifications = context?.notifications?.items || [];
  const fromFocus = focusPool.filter((item) => categorizeFocusItem(item) === 'supplier').length;
  const fromNotif = notifications.filter((n) => /supplier/i.test(`${n.category || ''} ${n.title || ''}`)).length;
  return Math.max(fromFocus, fromNotif);
}

/** Narrative summary lines — prose counts, not dashboard numbers. */
export function buildBusinessSummaryLines(status, context, focusPool = []) {
  const lines = [];
  const pool = focusPool.length ? focusPool : dedupeFocusForDisplay(context?.focusToday || [], 10);
  const supplierCount = countSupplierAttention(context, pool);
  const needsAttention = status.urgent > 0 || status.issues > 0;

  if (!needsAttention) lines.push('No critical issues.');
  else if (status.urgent > 0) {
    lines.push(`${status.urgent} thing${status.urgent === 1 ? '' : 's'} need${status.urgent === 1 ? 's' : ''} urgent attention.`);
  } else {
    lines.push(`${status.issues} item${status.issues === 1 ? '' : 's'} need${status.issues === 1 ? 's' : ''} attention.`);
  }

  if (status.opportunities > 0) {
    lines.push(`${status.opportunities} buying opportunit${status.opportunities === 1 ? 'y' : 'ies'}.`);
  }

  if (supplierCount > 0) {
    lines.push(`${supplierCount} supplier${supplierCount === 1 ? '' : 's'} require${supplierCount === 1 ? 's' : ''} attention.`);
  }

  return lines.slice(0, 3);
}

/** Behavioural KPI — Apollo proving value, not looking impressive. */
export function buildApolloInfluence(context) {
  const items = context?.notifications?.items || [];
  const decisionsToday = items.filter((item) => {
    const outcome = item.decisionOutcome || item.decision_outcome;
    const feedback = item.feedbackStatus || item.feedback_status;
    return (outcome && outcome !== 'no_action_taken')
      || item.businessValue
      || item.business_value
      || feedback === 'acted_on'
      || feedback === 'useful';
  }).length;

  const rulesApplied = summarizeBusinessRulesApplied(items);
  const suppressedToday = items.filter((item) => item.payload?.expectedBehaviourSuppressed).length;
  const resolvedToday = items.filter((item) => item.payload?.negativeStockClass === 'resolved_automatically').length;

  let headline = decisionsToday > 0
    ? `Apollo influenced ${decisionsToday} business decision${decisionsToday === 1 ? '' : 's'} today`
    : 'Apollo influenced — tracking starts when you act on a recommendation';

  if (rulesApplied.total > 0) {
    headline = `Business rules applied today: ${rulesApplied.total}`;
  } else if (suppressedToday > 0) {
    headline = `Expected behaviour suppressed: ${suppressedToday} today`;
  } else if (resolvedToday > 0) {
    headline = `${resolvedToday} timing issue${resolvedToday === 1 ? '' : 's'} resolved automatically today`;
  }

  return {
    decisionsToday,
    rulesAppliedToday: rulesApplied.total,
    rulesAppliedBreakdown: rulesApplied.breakdown,
    rulebookVersion: rulesApplied.rulebookVersion,
    suppressedToday,
    resolvedToday,
    trackingLive: decisionsToday > 0 || rulesApplied.total > 0 || suppressedToday > 0 || resolvedToday > 0,
    headline,
  };
}

export function focusUrgencyLabel(rank, severity) {
  if (rank === 1) return '🔴 Do this first';
  if (rank === 2 || displaySeverity(severity) === 'urgent') return '🟡 Do next';
  return 'Worth reviewing';
}

export function confidenceLevelText(confidence) {
  if (confidence == null || Number.isNaN(Number(confidence))) return null;
  const pct = Math.round(Number(confidence));
  if (pct >= 85) return 'High confidence';
  if (pct >= 60) return 'Medium confidence';
  return 'Low confidence';
}

function shortenActionText(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/^Review stock cover before demand outruns supply\.?$/i, 'Review stock cover')
    .replace(/^Check whether demand has slowed or stock\/listing issues are suppressing sales\.?$/i, 'Check demand and listing')
    .replace(/\.$/, '');
}

/** Why am I seeing this today? — builds trust fast. */
export function buildWhyToday(item) {
  const badge = buildEventBadge(item);
  const detail = String(item.detail || '').trim();
  const title = String(item.title || '').toLowerCase();

  if (badge?.key === 'sales_spike') return 'Sales increased yesterday.';
  if (badge?.key === 'sales_drop') return 'Sales dropped against recent trend.';
  if (badge?.key === 'supplier_followup' || badge?.key === 'supplier_delay') {
    if (/eta|container|shipment|delay/i.test(detail) || /eta|container|delay/i.test(title)) {
      return 'Container ETA changed.';
    }
    return 'Supplier deadline moved.';
  }
  if (badge?.key === 'customer_quiet') return 'Customer is quieter than usual.';
  if (badge?.key === 'buying_review' || badge?.key === 'stock_cover') return 'Stock cover needs a decision today.';
  if (badge?.key === 'negative_stock') return 'Stock went negative in ERP.';
  if (badge?.key === 'stock_awaiting_grv' || badge?.key === 'grv_in_progress' || badge?.key === 'stock_timing') {
    const reasoning = item?.payload?.reasoning;
    if (Array.isArray(reasoning) && reasoning[0]) return reasoning[0].endsWith('.') ? reasoning[0] : `${reasoning[0]}.`;
    return 'GRV is still being processed.';
  }
  if (badge?.key === 'resolved_automatically') return 'Stock corrected itself after GRV timing.';
  if (badge?.key === 'inventory_investigation' || badge?.key === 'stock_discrepancy') {
    return 'Negative stock persisted without a matching GRV.';
  }
  if (badge?.key === 'low_stock' || badge?.key === 'zero_stock') return 'On-hand stock is running low.';
  if (badge?.key === 'order_overdue') return 'A commitment date passed.';
  if (badge?.key === 'awaiting_approval') return 'Waiting on your approval.';

  if (detail && detail.length <= 90) {
    return detail.endsWith('.') ? detail : `${detail}.`;
  }
  return 'Flagged in today\'s operational scan.';
}

function buildRecommendSummary(view, item) {
  if (view.kind === 'product' && view.description) {
    if (view.eventBadge?.key === 'sales_spike') return `${view.description} demand increasing`;
    if (view.eventBadge?.key === 'sales_drop') return `${view.description} sales slowing`;
    return view.description;
  }
  return formatStatusInsight(item) || view.description || String(item.title || '').trim();
}

function formatStatusInsight(item) {
  const title = String(item.title || item.label || '').trim();
  if (!title) return heroFocusLabel(item);

  const cleaned = title
    .replace(/^Supplier follow-up:\s*/i, '')
    .replace(/^Notification:\s*/i, '')
    .trim();

  if (/wallet/i.test(cleaned) && /spike|sales|demand|cover|stock/i.test(cleaned)) {
    return 'Wallet demand accelerating';
  }

  return cleaned.length > 72 ? `${cleaned.slice(0, 69)}…` : cleaned;
}

function pickBiggestRisk(context, focusPool) {
  const notifications = context?.notifications?.items || [];
  const candidates = [
    ...focusPool,
    ...notifications.map((n) => ({
      title: n.title,
      label: n.title,
      severity: n.severity,
      category: n.category,
      type: `notification_${n.category || 'alert'}`,
    })),
  ];

  const risks = candidates
    .filter((item) => {
      const cat = categorizeFocusItem(item);
      const sev = displaySeverity(item.severity);
      return sev === 'urgent' || sev === 'attention' || cat === 'supplier' || cat === 'customer';
    })
    .sort((a, b) => {
      const catScore = (item) => {
        const cat = categorizeFocusItem(item);
        if (cat === 'supplier') return 0;
        if (cat === 'customer') return 1;
        return 2;
      };
      const diff = catScore(a) - catScore(b);
      if (diff !== 0) return diff;
      return severityRank(a.severity) - severityRank(b.severity);
    });

  return risks[0] ? formatStatusInsight(risks[0]) : null;
}

function pickBiggestOpportunity(focusPool) {
  const buying = focusPool
    .filter((item) => categorizeFocusItem(item) === 'buying')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  return buying[0] ? formatStatusInsight(buying[0]) : null;
}

const GENERIC_FOCUS_ACTIONS = new Set([
  'review stock cover before demand outruns supply.',
  'review stock cover before demand outruns supply',
  'check whether demand has slowed or stock/listing issues are suppressing sales.',
]);

/** Pull Proto product code from notification/focus payload or detail line. */
export function extractProductCode(item) {
  if (!item) return '';
  const direct = item.sku || item.code || item.payload?.code;
  if (direct) return String(direct).trim().toUpperCase();

  const dedupe = String(item.dedupeKey || item.dedupe_key || '');
  let match = dedupe.match(/^buying:([^:]+):/i);
  if (match) return match[1].toUpperCase();
  match = dedupe.match(/^exception:[^:]+:([A-Z0-9][A-Z0-9._-]*)/i);
  if (match) return match[1].toUpperCase();

  const detail = String(item.detail || '');
  match = detail.match(/^([A-Z0-9][A-Z0-9._-]{2,})\s*·/);
  if (match) return match[1].toUpperCase();

  return '';
}

/** Prefix titles with product code when Proto has one — codes are how the team thinks. */
export function formatWithProductCode(item, title = '') {
  const code = extractProductCode(item);
  const text = String(title || item?.title || item?.label || '').trim();
  if (!code) return text;
  const upper = text.toUpperCase();
  if (upper.startsWith(`${code} ·`) || upper.startsWith(`${code} -`) || upper.startsWith(`${code} —`)) return text;
  if (upper.includes(` ${code} `) || upper.includes(`(${code})`)) return text;
  return `${code} · ${text}`;
}

const PRODUCT_EVENT_PATTERNS = [
  { pattern: /\s+sales spiked$/i, headline: 'Sales spiked', badge: 'sales_spike' },
  { pattern: /\s+sales dropped$/i, headline: 'Sales dropped', badge: 'sales_drop' },
  { pattern: /\s+stock differs between ERP and website$/i, headline: 'Stock mismatch', badge: 'stock_mismatch' },
  { pattern: /\s+price differs between ERP and website$/i, headline: 'Price mismatch', badge: 'price_mismatch' },
  { pattern: /\s+is missing from the website$/i, headline: 'Missing from website', badge: 'missing_website' },
  { pattern: /\s+is missing from ERP$/i, headline: 'Missing from ERP', badge: 'missing_erp' },
  { pattern: /\s+stock cover is ([\d.]+ days?)$/i, headline: (m) => `Stock cover ${m[1]}`, badge: 'stock_cover' },
];

const EVENT_BADGE_CATALOG = {
  sales_spike: { emoji: '🟢', label: 'SALES SPIKE', tone: 'green' },
  sales_drop: { emoji: '🔴', label: 'SALES DROP', tone: 'red' },
  negative_stock: { emoji: '🔴', label: 'NEGATIVE STOCK', tone: 'red' },
  stock_awaiting_grv: { emoji: '🟡', label: 'STOCK AWAITING GRV', tone: 'amber' },
  grv_in_progress: { emoji: '🟡', label: 'GRV IN PROGRESS', tone: 'amber' },
  stock_timing: { emoji: '🟡', label: 'STOCK TIMING DIFFERENCE', tone: 'amber' },
  stock_discrepancy: { emoji: '🔴', label: 'STOCK DISCREPANCY', tone: 'red' },
  inventory_investigation: { emoji: '🔴', label: 'INVENTORY INVESTIGATION', tone: 'red' },
  resolved_automatically: { emoji: '🟢', label: 'RESOLVED AUTOMATICALLY', tone: 'green' },
  zero_stock: { emoji: '🔴', label: 'ZERO STOCK', tone: 'red' },
  low_stock: { emoji: '🟡', label: 'LOW STOCK', tone: 'amber' },
  buying_review: { emoji: '🟡', label: 'BUYING REVIEW', tone: 'amber' },
  stock_cover: { emoji: '🟡', label: 'STOCK COVER', tone: 'amber' },
  stock_mismatch: { emoji: '🔴', label: 'STOCK MISMATCH', tone: 'red' },
  price_mismatch: { emoji: '🟡', label: 'PRICE MISMATCH', tone: 'amber' },
  missing_website: { emoji: '🟡', label: 'MISSING WEBSITE', tone: 'amber' },
  missing_erp: { emoji: '🔴', label: 'MISSING ERP', tone: 'red' },
  supplier_followup: { emoji: '🟡', label: 'SUPPLIER FOLLOW-UP', tone: 'amber' },
  supplier_delay: { emoji: '🔴', label: 'SUPPLIER DELAY', tone: 'red' },
  customer_quiet: { emoji: '🟡', label: 'CUSTOMER QUIET', tone: 'amber' },
  order_overdue: { emoji: '🔴', label: 'ORDER OVERDUE', tone: 'red' },
  awaiting_approval: { emoji: '🟡', label: 'AWAITING APPROVAL', tone: 'amber' },
};

const METRIC_LABEL_SHORT = {
  'Current quantity': 'ON HAND',
  'Recent daily baseline': 'NORMAL SALES',
  'Daily sales velocity': 'NORMAL SALES',
  'Average daily sales': 'AVERAGE DAILY SALES',
  'Current stock': 'ON HAND',
  'Stock cover': 'STOCK COVER',
  'Supplier lead time': 'LEAD TIME',
  'Change': 'CHANGE',
};

const SALES_RATE_METRICS = new Set(['NORMAL SALES', 'AVERAGE DAILY SALES']);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripProductDescription(title, code) {
  let text = String(title || '').trim();
  text = text.replace(/^Buying review:\s*/i, '').trim();
  if (code) {
    text = text.replace(new RegExp(`^${escapeRegExp(code)}\\s*[·\\-—]\\s*`, 'i'), '');
  }
  for (const row of PRODUCT_EVENT_PATTERNS) {
    text = text.replace(row.pattern, '');
  }
  return text.trim();
}

function extractHeadline(title, item) {
  const text = String(title || '').trim();
  for (const row of PRODUCT_EVENT_PATTERNS) {
    const match = text.match(row.pattern);
    if (match) return typeof row.headline === 'function' ? row.headline(match) : row.headline;
  }
  if (/^Buying review:/i.test(text)) return 'Buying review';
  if (/supplier follow-up:/i.test(text)) return 'Supplier follow-up';
  if (/supplier delay risk/i.test(text)) return 'Supplier delay risk';
  if (/order is overdue/i.test(text)) return 'Order overdue';
  if (/quiet for/i.test(text)) return 'Customer quiet';
  if (/awaiting approval/i.test(text)) return 'Awaiting approval';
  const action = String(item?.action || item?.recommendation || '').trim();
  if (action && !GENERIC_FOCUS_ACTIONS.has(action.toLowerCase())) return action;
  return null;
}

function resolveEventBadgeKey(item, headline) {
  const category = String(item?.category || item?.type || '').toLowerCase();
  const title = String(item?.title || '').toLowerCase();
  const stockBucket = item?.payload?.stockBucket;
  const negativeClass = item?.payload?.negativeStockClass;

  if (negativeClass === 'resolved_automatically' || stockBucket === 'negative_resolved' || category.includes('stock_timing_resolved')) {
    return 'resolved_automatically';
  }
  if (negativeClass === 'investigate' || stockBucket === 'negative_investigate' || category.includes('negative_stock_investigation')) {
    return 'inventory_investigation';
  }
  if (negativeClass === 'grv_in_progress' || item?.payload?.pendingGrv) return 'grv_in_progress';
  if (negativeClass === 'temporary_timing' || stockBucket === 'negative_timing' || category.includes('stock_timing')) {
    return 'stock_awaiting_grv';
  }
  if (stockBucket === 'negative' || category.includes('negative_stock') || /negative stock|stock discrepancy|stock awaiting grv|grv in progress/i.test(title)) {
    if (/grv|awaiting grv|timing/i.test(title)) return 'stock_awaiting_grv';
    if (/discrepancy|investigat/i.test(title)) return 'inventory_investigation';
    return 'negative_stock';
  }
  if (stockBucket === 'zero' || category.includes('zero_stock')) return 'zero_stock';
  if (stockBucket === 'low' || category.includes('low_stock')) return 'low_stock';

  for (const row of PRODUCT_EVENT_PATTERNS) {
    if (row.pattern.test(title) && row.badge) return row.badge;
  }

  if (/buying review/i.test(title) || category.includes('buying_review')) return 'buying_review';
  if (category.includes('stock_cover')) return 'stock_cover';
  if (/supplier follow-up/i.test(title) || category.includes('supplier_followup')) return 'supplier_followup';
  if (/supplier delay/i.test(title) || category.includes('supplier_delay')) return 'supplier_delay';
  if (/quiet for/i.test(title) || category.includes('customer_behaviour') || category.includes('inactive_customer')) {
    return 'customer_quiet';
  }
  if (/order is overdue/i.test(title) || category.includes('overdue')) return 'order_overdue';
  if (/awaiting approval/i.test(title) || category.includes('pending')) return 'awaiting_approval';

  if (headline === 'Sales spiked') return 'sales_spike';
  if (headline === 'Sales dropped') return 'sales_drop';
  if (headline === 'Buying review') return 'buying_review';
  if (headline === 'Supplier follow-up') return 'supplier_followup';
  if (headline === 'Supplier delay risk') return 'supplier_delay';
  if (headline === 'Customer quiet') return 'customer_quiet';
  if (headline === 'Order overdue') return 'order_overdue';
  if (headline === 'Awaiting approval') return 'awaiting_approval';
  if (headline && /stock cover/i.test(headline)) return 'stock_cover';

  return null;
}

export function buildEventBadge(item, headline = null) {
  const resolvedHeadline = headline ?? extractHeadline(item?.title || item?.label, item);
  const key = resolveEventBadgeKey(item, resolvedHeadline);
  if (!key || !EVENT_BADGE_CATALOG[key]) return null;
  return { ...EVENT_BADGE_CATALOG[key], key };
}

/** Relative time for operational cards — Apollo should feel alive. */
export function formatApolloRelativeTime(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diffMs = Math.max(0, now.getTime() - then.getTime());
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;

  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  if (then >= startYesterday && then < startToday) return 'Yesterday';

  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffDay < 7) return `${diffDay} days ago`;
  return then.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function extractItemTimestamp(item) {
  return item?.detectedAt || item?.detected_at || item?.lastSeenAt || item?.last_seen_at
    || item?.createdAt || item?.created_at || item?.payload?.detectedAt || null;
}

/** Visual confidence chip — colour reads faster than a number alone. */
export function buildConfidenceChip(confidence) {
  if (confidence == null || Number.isNaN(Number(confidence))) return null;
  const pct = Math.round(Number(confidence));
  if (pct >= 85) return { emoji: '🟢', label: 'HIGH CONFIDENCE', tone: 'green', value: `${pct}%` };
  if (pct >= 60) return { emoji: '🟡', label: 'MEDIUM', tone: 'amber', value: `${pct}%` };
  return { emoji: '🔴', label: 'LOW', tone: 'red', value: `${pct}%` };
}

/** Business impact — how important is this? */
export function buildImpactBadge(item) {
  const raw = String(
    item?.businessImpact || item?.business_impact || item?.payload?.businessImpact || '',
  ).toLowerCase();
  if (raw === 'high' || raw === 'critical') {
    return { emoji: '🔴', label: 'HIGH IMPACT', tone: 'red', level: 'high' };
  }
  if (raw === 'low') {
    return { emoji: '🟢', label: 'LOW IMPACT', tone: 'green', level: 'low' };
  }
  if (raw === 'medium') {
    return { emoji: '🟡', label: 'MEDIUM IMPACT', tone: 'amber', level: 'medium' };
  }

  const sev = displaySeverity(item?.severity || 'attention');
  if (sev === 'urgent') return { emoji: '🔴', label: 'HIGH IMPACT', tone: 'red', level: 'high' };
  if (sev === 'attention') return { emoji: '🟡', label: 'MEDIUM IMPACT', tone: 'amber', level: 'medium' };
  return { emoji: '🟢', label: 'LOW IMPACT', tone: 'green', level: 'low' };
}

/** Operational priority — separate from confidence. */
export function buildPriorityBadge(item) {
  const scoreRaw = item?.priorityScore ?? item?.priority_score ?? item?.payload?.priorityScore;
  if (scoreRaw != null && !Number.isNaN(Number(scoreRaw))) {
    const value = Math.round(Number(scoreRaw));
    let tone = 'amber';
    if (value >= 85) tone = 'red';
    else if (value < 55) tone = 'green';
    return { label: 'PRIORITY', value: String(value), tone };
  }

  const rank = Number(item?.priority);
  if (rank >= 1 && rank <= 8) {
    const value = Math.max(40, 100 - (rank - 1) * 8);
    let tone = 'green';
    if (rank <= 2) tone = 'red';
    else if (rank <= 4) tone = 'amber';
    return { label: 'PRIORITY', value: String(value), tone };
  }
  return null;
}

function formatMetricDisplay(label, value) {
  if (!SALES_RATE_METRICS.has(label)) return value;
  const text = String(value ?? '').trim();
  if (!text || text.endsWith('/day')) return text || '0/day';
  const num = Number(text.replace(/%$/, ''));
  if (!Number.isNaN(num)) return `${num}/day`;
  return text;
}

function extractSupplierFromDetail(detail, code) {
  const parts = String(detail || '').split('·').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2 && code && parts[0].toUpperCase() === code) return parts[1];
  return '';
}

function extractDepartmentFromDescription(description) {
  const match = String(description || '').match(/\(([^)]+)\)\s*$/);
  return match ? match[1].trim() : '';
}

function isCustomerItem(item) {
  const hay = `${item?.type || ''} ${item?.category || ''} ${item?.title || ''}`.toLowerCase();
  return /customer|inactive_customer|pending_customers|inactive_high_value|large_recent_order|order_yesterday|customer_behaviour/.test(hay)
    && !extractProductCode(item);
}

function isSupplierItem(item) {
  const hay = `${item?.type || ''} ${item?.category || ''} ${item?.title || ''}`.toLowerCase();
  return /supplier/.test(hay) && !extractProductCode(item);
}

function extractCustomerName(item, rawTitle) {
  if (item?.name) return String(item.name).trim();
  const split = rawTitle.split(/[—–-]/);
  if (split.length > 1) return split[0].trim();
  return rawTitle.replace(/\s+—.*/u, '').trim();
}

function extractSupplierName(item, rawTitle) {
  if (item?.payload?.supplier) return String(item.payload.supplier).trim();
  const followUp = rawTitle.match(/^Supplier follow-up:\s*(.+)$/i);
  if (followUp) return followUp[1].trim();
  const delay = rawTitle.match(/^(.+?)\s+supplier delay risk$/i);
  if (delay) return delay[1].trim();
  return rawTitle.replace(/^Supplier follow-up:\s*/i, '').trim();
}

/** Structured operational object — SKU first, description second. */
export function buildOperationalObjectView(item) {
  if (!item) {
    return {
      kind: 'generic',
      searchText: '',
      identifierLabel: null,
      identifier: null,
      description: '',
      meta: null,
      headline: null,
      eventBadge: null,
      recommendation: null,
    };
  }

  const rawTitle = String(item.title || item.label || '').trim();
  const code = extractProductCode(item);
  const headline = extractHeadline(rawTitle, item);
  const eventBadge = buildEventBadge(item, headline);
  const recommendation = String(item.action || item.recommendation || '').trim() || null;

  if (isSupplierItem(item)) {
    const identifier = extractSupplierName(item, rawTitle);
    return {
      kind: 'supplier',
      identifierLabel: 'Supplier',
      identifier,
      description: String(item.detail || '').trim() || null,
      meta: null,
      headline,
      eventBadge: eventBadge || buildEventBadge({ title: rawTitle, category: 'supplier_followups' }, headline),
      recommendation,
      searchText: identifier,
    };
  }

  if (isCustomerItem(item)) {
    const identifier = extractCustomerName(item, rawTitle);
    return {
      kind: 'customer',
      identifierLabel: 'Customer',
      identifier,
      description: String(item.detail || '').trim() || null,
      meta: null,
      headline,
      eventBadge: eventBadge || buildEventBadge({ title: rawTitle, category: 'customer_behaviour_change' }, headline),
      recommendation,
      searchText: identifier,
    };
  }

  if (code) {
    let description = stripProductDescription(rawTitle, code);
    let department = String(item.payload?.department || item.department || item.dept || '').trim();
    if (!department) department = extractDepartmentFromDescription(description);
    if (department) description = description.replace(/\s*\([^)]+\)\s*$/, '').trim();

    const supplier = String(item.payload?.supplier || item.supplier || '').trim()
      || extractSupplierFromDetail(item.detail, code);
    const meta = [department, supplier].filter(Boolean).join(' • ') || null;

    return {
      kind: 'product',
      sku: code,
      identifierLabel: 'SKU',
      identifier: code,
      description: description || rawTitle,
      department: department || null,
      supplier: supplier || null,
      meta,
      headline,
      eventBadge: eventBadge || buildEventBadge(item, headline),
      recommendation: recommendation && !GENERIC_FOCUS_ACTIONS.has(recommendation.toLowerCase())
        ? recommendation
        : null,
      searchText: [code, description, department, supplier, eventBadge?.label].filter(Boolean).join(' '),
    };
  }

  return {
    kind: 'generic',
    identifierLabel: null,
    identifier: null,
    description: rawTitle,
    meta: null,
    headline,
    eventBadge,
    recommendation,
    searchText: rawTitle,
  };
}

export function buildEvidenceMetrics(item) {
  const raw = item?.payload?.evidence || item?.evidence;
  if (!Array.isArray(raw) || !raw.length) return [];
  return raw
    .map((row) => {
      if (typeof row !== 'object' || row == null) return null;
      const label = METRIC_LABEL_SHORT[row.label] || String(row.label || '').trim();
      const value = formatMetricDisplay(label, row.value);
      if (!label || value == null || value === '') return null;
      return { label, value };
    })
    .filter(Boolean);
}

/** Drop duplicate focus rows (same title or same generic recommendation). */
export function dedupeFocusForDisplay(focus = [], limit = 5) {
  const seenTitles = new Set();
  const seenLabels = new Set();
  const out = [];

  for (const item of focus) {
    const titleKey = String(item.title || item.label || '').trim().toLowerCase();
    const label = heroFocusLabel(item);
    const labelKey = label.trim().toLowerCase();
    if (titleKey && seenTitles.has(titleKey)) continue;
    if (seenLabels.has(labelKey)) continue;
    if (titleKey) seenTitles.add(titleKey);
    seenLabels.add(labelKey);
    out.push(item);
    if (out.length >= limit) break;
  }

  return out;
}

function heroFocusLabel(item) {
  const title = formatWithProductCode(item, String(item.title || item.label || '').trim());
  const action = String(item.action || '').trim();
  const detail = String(item.detail || '').trim();
  const evidence = parseEvidence(item);
  const evidenceShort = evidence[0] || '';

  if (!title) return action || 'Review operational item';

  const actionIsGeneric = !action
    || action === title
    || GENERIC_FOCUS_ACTIONS.has(action.toLowerCase());

  if (actionIsGeneric) {
    if (evidenceShort && !title.includes(evidenceShort)) return `${title} — ${evidenceShort}`;
    if (detail && detail.length <= 72 && !title.includes(detail)) return `${title} — ${detail}`;
    return title;
  }

  return `${title} — ${action}`;
}

function focusHeroTitle(count) {
  if (count === 1) return '1 thing requires your attention';
  if (count <= 3) return `${count} things require your attention`;
  return 'These deserve your attention first';
}

/** Hero numbered focus — one item per responsibility area. Default max 3. */
export function buildHeroFocusItems(focus = [], limit = 3) {
  return diverseFocusForDisplay(focus, limit).map((item, index) => {
    const category = categorizeFocusItem(item);
    const rank = index + 1;
    return {
      rank,
      category,
      categoryLabel: FOCUS_CATEGORY_LABELS[category] || 'Operations',
      label: heroFocusLabel(item),
      summaryLabel: formatStatusInsight(item),
      urgencyLabel: focusUrgencyLabel(rank, item.severity),
      severity: displaySeverity(item.severity || 'attention'),
      item,
    };
  });
}

export { focusHeroTitle };

/** Trusted operations manager greeting — Apollo speaks first. */
export function buildProactiveGreeting(context, { userName, hour = new Date().getHours() } = {}) {
  if (!context) return { lead: `${greetingForHour(hour)} ${userName || 'there'}.`, lines: [] };

  const focus = context.focusToday || [];
  const name = userName || 'there';
  const lead = `${greetingForHour(hour)} ${name}.`;
  const lines = [];

  if (!focus.length) {
    lines.push('Proto looks steady today — nothing urgent is competing for your hour.');
    return { lead, lines };
  }

  const distinct = dedupeFocusForDisplay(focus, 5);
  const buckets = { customer: 0, supplier: 0, buying: 0, orders: 0 };
  distinct.forEach((item) => {
    const bucket = categorizeFocusItem(item);
    if (buckets[bucket] != null) buckets[bucket] += 1;
  });

  const parts = [];
  if (buckets.buying) {
    parts.push(buckets.buying === 1 ? 'stock or buying' : `${buckets.buying} stock/buying items`);
  }
  if (buckets.customer) {
    parts.push(buckets.customer === 1 ? 'a customer' : `${buckets.customer} customers`);
  }
  if (buckets.supplier) {
    parts.push(buckets.supplier === 1 ? 'a supplier follow-up' : `${buckets.supplier} supplier follow-ups`);
  }
  if (buckets.orders) {
    parts.push(buckets.orders === 1 ? 'an order decision' : `${buckets.orders} orders`);
  }

  if (parts.length) {
    lines.push(`Priority areas today: ${parts.join(' · ')}.`);
  }

  return { lead, lines: lines.slice(0, 2) };
}

export function buildHealthCard(context) {
  const score = businessHealthScore(context);
  const pct = score == null ? 0 : Math.min(100, Math.max(0, (score / 10) * 100));
  const filled = Math.round(pct / 10);
  const bar = `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  return {
    score,
    display: score == null ? '—' : score.toFixed(1),
    max: 10,
    label: healthLabel(score),
    bar,
    severity: score == null
      ? 'grey'
      : score >= 8
        ? 'green'
        : score >= 6
          ? 'amber'
          : 'red',
    maturity: OPERATIONAL_MATURITY,
  };
}

function parseEvidence(item) {
  const raw = item.evidence;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((row) => (typeof row === 'object' ? `${row.label}: ${row.value}` : String(row)));
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(' · ').map((s) => s.trim()).filter(Boolean);
  }
  const fallback = [item.detail, item.why].filter(Boolean);
  return fallback.slice(0, 3);
}

/** Scan-friendly Daily Brief — Risks / Wins / Changes / Recommendations. */
export function buildDailyBriefScan(context) {
  if (!context) {
    return { risks: [], wins: [], changes: [], recommendations: [] };
  }

  const focus = dedupeFocusForDisplay(context.focusToday || [], 5);
  const changed = context.whatChangedSinceYesterday || [];

  const risks = focus
    .filter((item) => ['urgent', 'attention'].includes(displaySeverity(item.severity)))
    .slice(0, 4)
    .map((item) => heroFocusLabel(item))
    .filter(Boolean);

  const wins = changed
    .filter((line) => displaySeverity(line.severity) === 'healthy' || line.type === 'orders')
    .slice(0, 3)
    .map((line) => line.text)
    .filter(Boolean);

  const changes = changed.slice(0, 4).map((line) => line.text).filter(Boolean);

  const recommendations = focus
    .filter((item) => item.action && item.action !== item.title)
    .slice(0, 3)
    .map((item) => {
      const action = String(item.action || '').trim();
      if (GENERIC_FOCUS_ACTIONS.has(action.toLowerCase())) return heroFocusLabel(item);
      return action;
    })
    .filter(Boolean);

  return { risks, wins, changes, recommendations };
}

/** Explainable recommendations — confidence only when evidence exists. */
export function buildApolloRecommends(focus = []) {
  return dedupeFocusForDisplay(focus, 4)
    .filter((item) => item.action || item.recommendation || item.title)
    .map((item) => {
      const view = buildOperationalObjectView(item);
      const metrics = buildEvidenceMetrics(item);
      const action = String(item.action || item.recommendation || '').trim();
      const rawTitle = String(item.title || item.label || action || 'Recommendation').trim();
      const title = view.kind === 'product' && view.sku
        ? `${view.sku} · ${view.description}`
        : formatWithProductCode(item, rawTitle);
      const confidenceRaw = item.confidence != null ? Number(item.confidence) : item.payload?.confidence;
      const confidenceNum = confidenceRaw != null ? Number(confidenceRaw) : null;
      const confidence = (metrics.length) && confidenceNum != null && !Number.isNaN(confidenceNum)
        ? Math.round(confidenceNum)
        : null;
      const recommendationText = action || view.recommendation || null;
      const reasoning = Array.isArray(item.payload?.reasoning) ? item.payload.reasoning : [];
      const confidenceChip = buildConfidenceChip(confidence);
      return {
        id: `${item.type}-${item.priority}`,
        title,
        code: view.sku || extractProductCode(item),
        view: { ...view, recommendation: recommendationText },
        summaryHeadline: buildRecommendSummary(view, item),
        actionShort: shortenActionText(recommendationText),
        whyToday: buildWhyToday(item),
        reasoning,
        confidenceLevel: item.payload?.confidenceLevel
          ? `${String(item.payload.confidenceLevel).charAt(0).toUpperCase()}${String(item.payload.confidenceLevel).slice(1)} confidence`
          : confidenceLevelText(confidence),
        metrics,
        recommendationText,
        confidence,
        confidenceChip,
        impactBadge: buildImpactBadge(item),
        priorityBadge: buildPriorityBadge(item),
        relativeTime: formatApolloRelativeTime(extractItemTimestamp(item)),
        severity: displaySeverity(item.severity || 'attention'),
        item,
      };
    });
}

function notificationUrgencyBucket(item) {
  const sev = displaySeverity(item.severity);
  if (item.category === 'stock_timing' || item.payload?.negativeStockClass === 'temporary_timing' || item.payload?.negativeStockClass === 'grv_in_progress') {
    return 'info';
  }
  if (sev === 'urgent' || item.severity === 'critical') return 'immediate';
  if (sev === 'attention' || item.severity === 'action' || item.severity === 'review') return 'today';
  return 'info';
}

/** Group notifications by operational urgency — presentation only. */
export function groupNotificationsByUrgency(items = []) {
  const grouped = { immediate: [], today: [], info: [] };
  items.forEach((item) => {
    const bucket = notificationUrgencyBucket(item);
    grouped[bucket].push({
      id: item.id || item.dedupeKey || item.title,
      title: item.title,
      displayTitle: formatWithProductCode(item, item.title),
      code: extractProductCode(item),
      view: buildOperationalObjectView(item),
      detail: item.detail,
      severity: displaySeverity(item.severity),
      relativeTime: formatApolloRelativeTime(
        item.detectedAt || item.detected_at || item.lastSeenAt || item.last_seen_at || item.createdAt || item.created_at,
      ),
      url: item.actionUrl || item.url,
      query: item.payload?.query || item.query || null,
    });
  });
  return grouped;
}

/** Remember section — placeholder until Proto Memory is live. */
export function buildRememberItems() {
  return [];
}

export function rememberEmptyCopy() {
  return 'Nothing remembered yet.';
}

export const REMEMBER_TEACHING_TOPICS = [
  'Customer preferences',
  'Supplier lessons',
  'Buying lessons',
];

/** Morning status strip — is the business OK? */
export function buildBusinessStatus(context) {
  const card = buildHealthCard(context);
  const focusPool = dedupeFocusForDisplay(context?.focusToday || [], 10);
  const notifications = context?.notifications?.items || [];
  const grouped = groupNotificationsByUrgency(notifications);

  const urgent = grouped.immediate.length
    + focusPool.filter((item) => displaySeverity(item.severity) === 'urgent').length;
  const issues = focusPool.filter((item) => ['urgent', 'attention'].includes(displaySeverity(item.severity))).length
    || grouped.immediate.length + grouped.today.length;
  const opportunities = focusPool.filter((item) => categorizeFocusItem(item) === 'buying').length
    || notifications.filter((n) => /buying|stock|inventory/i.test(`${n.category || ''} ${n.title || ''}`)).length;

  const percent = card.score == null ? null : Math.round(card.score * 10);
  const emoji = card.severity === 'green' ? '🟢'
    : card.severity === 'amber' ? '🟡'
      : card.severity === 'red' ? '🔴'
        : '⚪';

  const narrative = {
    headline: businessStatusHeadline(card.label, emoji),
    lines: [],
  };

  const status = {
    label: card.label,
    emoji,
    percent,
    displayScore: card.display,
    issues,
    opportunities,
    urgent,
    severity: card.severity,
    biggestRisk: pickBiggestRisk(context, focusPool),
    biggestOpportunity: pickBiggestOpportunity(focusPool),
    headline: narrative.headline,
    detail: {
      healthScore: card.display,
      percent,
      bar: card.bar,
      issues,
      opportunities,
      urgent,
      label: card.label,
    },
  };

  status.lines = buildBusinessSummaryLines(status, context, focusPool);
  return status;
}

/** Scannable Daily Brief bullets with optional detail sections. */
export function buildDailyBriefBullets(context) {
  if (!context) return { bullets: [], detailSections: [] };

  const focus = dedupeFocusForDisplay(context.focusToday || [], 10);
  const health = context.businessHealth || [];
  const notifications = context.notifications?.items || [];

  const buying = focus.filter((item) => categorizeFocusItem(item) === 'buying').length;
  const supplier = focus.filter((item) => categorizeFocusItem(item) === 'supplier').length
    + notifications.filter((n) => /supplier/i.test(`${n.category || ''} ${n.title || ''}`)).length;

  const website = health.find((h) => /website/i.test(h.label || h.key || ''));
  const orders = health.find((h) => /order|sales/i.test(h.label || h.key || ''));

  const bullets = [];

  bullets.push({
    tone: buying ? 'ok' : 'neutral',
    text: buying
      ? `${buying} buying opportunit${buying === 1 ? 'y' : 'ies'}`
      : 'No buying flags',
  });

  bullets.push({
    tone: supplier ? 'warn' : 'ok',
    text: supplier
      ? `${supplier} supplier risk${supplier === 1 ? '' : 's'}`
      : 'Suppliers clear',
  });

  const websiteCalm = !website || ['healthy', 'info'].includes(website.severity);
  bullets.push({
    tone: websiteCalm ? 'ok' : 'warn',
    text: websiteCalm ? 'Website healthy' : (website.status || 'Website needs review'),
  });

  const ordersCalm = !orders || ['healthy', 'info'].includes(orders.severity);
  bullets.push({
    tone: ordersCalm ? 'ok' : 'warn',
    text: orders?.status || 'Orders updated',
  });

  const scan = buildDailyBriefScan(context);
  const detailSections = [
    { label: 'Risks', items: scan.risks },
    { label: 'Changes', items: scan.changes },
    { label: 'Wins', items: scan.wins },
    { label: 'Recommendations', items: scan.recommendations },
  ].filter((section) => section.items.length);

  return { bullets, detailSections };
}

/** Knowledge hub — presentation until Proto Memory is live. */
export const APOLLO_RESPONSIBILITIES = [
  { id: 'truth', label: 'Truth', status: 'earned' },
  { id: 'context', label: 'Context', status: 'earned' },
  { id: 'knowledge', label: 'Knowledge', status: 'emerging', note: 'Proto Memory emerging' },
  { id: 'rulebook', label: 'Rulebook', status: 'emerging', note: 'Rulebook v1.0 live' },
  { id: 'reasoning', label: 'Reasoning', status: 'waiting', note: 'Combines Knowledge + Rulebook' },
  { id: 'advice', label: 'Advice', status: 'waiting', note: 'Waiting for Reasoning' },
  { id: 'execution', label: 'Execution', status: 'earned' },
  { id: 'coordination', label: 'Coordination', status: 'waiting', note: null },
  { id: 'stewardship', label: 'Stewardship', status: 'waiting', note: null },
];

export function responsibilityStatusIcon(status) {
  if (status === 'earned') return '✓';
  if (status === 'emerging') return '△';
  return '○';
}

export function buildApolloResponsibilities(overrides = {}) {
  return APOLLO_RESPONSIBILITIES.map((row) => ({
    ...row,
    ...(overrides[row.id] || {}),
    icon: responsibilityStatusIcon(overrides[row.id]?.status || row.status),
  }));
}

export const APOLLO_KNOWLEDGE_DEFAULT_COUNTS = {
  customer: 0,
  supplier: 0,
  buying: 0,
  decision: 0,
  operational: 0,
  business_rules: 1,
  reference: 0,
};

export const APOLLO_KNOWLEDGE_HEALTH_PURPOSE =
  "Proto's operational knowledge grows here. Knowledge is experience; Business Rules are judgment.";

export function buildKnowledgeHealth({
  verifiedKnowledge = 0,
  knowledgeReused = 0,
  activeOperational = 0,
  decisionLessons = 0,
  memoryActivated = false,
} = {}) {
  return {
    verifiedKnowledge,
    knowledgeReused,
    activeOperational,
    decisionLessons,
    memoryActivated,
    purposeCopy: APOLLO_KNOWLEDGE_HEALTH_PURPOSE,
    memoryStatusCopy: memoryActivated
      ? 'Proto Memory is active — knowledge grows as you work.'
      : 'Proto Memory has not yet been activated.',
  };
}

export function buildKnowledgeDomainCounts(overrides = {}) {
  return { ...APOLLO_KNOWLEDGE_DEFAULT_COUNTS, ...overrides };
}

export function formatKnowledgeDomainCount(domain, count = 0) {
  if (domain.status === 'reserved') return 'Reserved';
  if (domain.countType === 'active') return `${count} active`;
  if (domain.countType === 'rulebook') return domain.rulebookLabel || `Rulebook v1.0 · ${count} validated`;
  if (domain.countType === 'reference') return count > 0 ? `${count} documents` : 'Reserved';
  return `${count} verified`;
}
