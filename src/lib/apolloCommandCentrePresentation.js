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

function categorizeFocusItem(item) {
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

/** Hero numbered focus — specific titles, deduped. Default max 3 for scan efficiency. */
export function buildHeroFocusItems(focus = [], limit = 3) {
  return dedupeFocusForDisplay(focus, limit).map((item, index) => ({
    rank: index + 1,
    label: heroFocusLabel(item),
    severity: displaySeverity(item.severity || 'attention'),
    item,
  }));
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
  return 'Nothing committed to memory yet — use ＋ Remember when facts are worth keeping.';
}
