/** Apollo Command Centre — presentation helpers (no backend / business rules). */

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
  const title = String(item.title || item.label || '').trim();
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
    return {
      rank: index + 1,
      category,
      categoryLabel: FOCUS_CATEGORY_LABELS[category] || 'Operations',
      label: heroFocusLabel(item),
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
      const evidence = parseEvidence(item);
      const action = String(item.action || item.recommendation || '').trim();
      const title = String(item.title || item.label || action || 'Recommendation').trim();
      const actionIsGeneric = !action || GENERIC_FOCUS_ACTIONS.has(action.toLowerCase()) || action === title;
      const why = evidence.length
        ? evidence
        : (actionIsGeneric && item.why ? [item.why] : (action && !actionIsGeneric ? [action] : (item.why ? [item.why] : [])));
      const confidenceRaw = item.confidence != null ? Number(item.confidence) : null;
      const confidence = evidence.length && confidenceRaw != null && !Number.isNaN(confidenceRaw)
        ? Math.round(confidenceRaw)
        : null;
      return {
        id: `${item.type}-${item.priority}`,
        title,
        why,
        evidence,
        confidence,
        severity: displaySeverity(item.severity || 'attention'),
        item,
      };
    });
}

function notificationUrgencyBucket(item) {
  const sev = displaySeverity(item.severity);
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
      detail: item.detail,
      severity: displaySeverity(item.severity),
      url: item.actionUrl,
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

  return {
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
  };
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
  { id: 'attention', label: 'Attention', status: 'earned' },
  { id: 'execution', label: 'Execution', status: 'earned' },
  { id: 'memory', label: 'Memory', status: 'emerging', note: 'Not yet earned' },
  { id: 'reasoning', label: 'Reasoning', status: 'waiting', note: 'Waiting for Memory' },
  { id: 'advice', label: 'Advice', status: 'waiting', note: 'Waiting for Reasoning' },
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
};

export const APOLLO_KNOWLEDGE_HEALTH_PURPOSE =
  "Proto's operational knowledge grows here over time.";

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
  if (domain.countType === 'active') return `${count} active`;
  return `${count} verified`;
}
