import { formatApolloRelativeTime } from './apolloCommandCentrePresentation.js';

export const INBOX_WORK_TYPES = {
  order: { emoji: '📦', label: 'ORDER' },
  customer: { emoji: '👤', label: 'CUSTOMER' },
  supplier: { emoji: '🚚', label: 'SUPPLIER' },
  buying: { emoji: '📈', label: 'BUYING' },
};

const INBOX_CATEGORY_WHY = {
  orders_overdue: 'Order approval waiting',
  approaching_due_dates: 'Order due soon',
  inactive_orders: 'Order inactive',
  open_tasks: 'Task overdue',
  overdue_commitments: 'Commitment overdue',
  due_reminders: 'Reminder due',
  supplier_followups: 'Supplier follow-up',
  inactive_customer: 'Customer quiet',
  customer_followup: 'Customer follow-up',
};

const INBOX_CATEGORIES = new Set(Object.keys(INBOX_CATEGORY_WHY));

export const APOLLO_COMPOSER_HINTS = [
  'Talk to Apollo…',
  'Ask about Addie…',
  'Create an order…',
  'Remember something…',
  'Find low stock…',
  'Explain this recommendation…',
];

function parseWho(title = '', item = {}) {
  const supplier = String(title).match(/Supplier follow-up:\s*(.+)/i);
  if (supplier) return supplier[1].trim();

  const payloadName = item.payload?.customer || item.payload?.supplier || item.payload?.code;
  if (payloadName && !String(payloadName).match(/^\d+$/)) return String(payloadName).trim();

  const chunk = String(title).split(/[·:—]/)[0].trim();
  const trimmed = chunk
    .replace(/\s+order\b.*$/i, '')
    .replace(/\s+task\b.*$/i, '')
    .replace(/\s+reminder\b.*$/i, '')
    .replace(/\s+commitment\b.*$/i, '')
    .trim();
  return trimmed || 'Operations';
}

function parseWhy(item = {}) {
  const category = item.category || '';
  if (INBOX_CATEGORY_WHY[category]) return INBOX_CATEGORY_WHY[category];

  const detail = String(item.detail || item.recommendation || '').trim();
  if (detail) {
    const first = detail.split(/[.·]/)[0].trim();
    return first.length > 48 ? `${first.slice(0, 45)}…` : first;
  }

  const title = String(item.title || '').trim();
  const afterColon = title.split(':').pop()?.trim();
  return afterColon && afterColon !== title ? afterColon : 'Needs attention';
}

function resolveWorkType(item = {}) {
  const category = String(item.category || '');
  const type = String(item.type || '');

  if (category.includes('supplier') || category.includes('container') || type.includes('supplier')) {
    return INBOX_WORK_TYPES.supplier;
  }
  if (category.includes('customer') || category.includes('inactive_customer') || type.includes('customer')) {
    return INBOX_WORK_TYPES.customer;
  }
  if (category.includes('buying') || category.includes('stock') || type.includes('buying')) {
    return INBOX_WORK_TYPES.buying;
  }
  return INBOX_WORK_TYPES.order;
}

function inboxTimestamp(item) {
  return item.detectedAt || item.detected_at || item.lastSeenAt || item.last_seen_at
    || item.createdAt || item.created_at || null;
}

function isInboxCandidate(item) {
  if (!item) return false;
  const category = item.category || '';
  if (INBOX_CATEGORIES.has(category)) return true;
  if (category.includes('customer') || category.includes('order') || category.includes('supplier')) return true;
  if (item.type?.includes('customer') || item.type?.includes('supplier')) return true;
  return false;
}

export function buildApolloInboxItems(context = {}, { limit = 4 } = {}) {
  const pool = [
    ...(context.notifications?.items || []),
    ...(context.focusToday || []),
  ];

  const seen = new Set();
  const items = [];

  for (const raw of pool) {
    if (!isInboxCandidate(raw)) continue;
    const who = parseWho(raw.title || raw.label, raw);
    const why = parseWhy(raw);
    const workType = resolveWorkType(raw);
    const key = `${who}:${why}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      id: raw.id || raw.dedupeKey || raw.dedupe_key || `inbox-${items.length}`,
      who,
      why,
      when: formatApolloRelativeTime(inboxTimestamp(raw)) || 'Today',
      whenIso: inboxTimestamp(raw),
      workType,
      query: raw.payload?.query || raw.query || raw.title || null,
      url: raw.actionUrl || raw.url || null,
      source: raw,
    });

    if (items.length >= limit) break;
  }

  return items;
}

export function buildRecentConversationSnippets(messages = [], limit = 3) {
  return messages
    .filter((msg) => msg.role === 'user' && String(msg.content || '').trim())
    .slice(-limit)
    .reverse()
    .map((msg, index) => ({
      id: `recent-${index}`,
      label: String(msg.content).trim().split('\n')[0].slice(0, 56),
    }));
}

export function buildRecentActionSnippets(context = {}, limit = 3) {
  return (context.notifications?.items || [])
    .filter((item) => item.decisionOutcome && item.decisionOutcome !== 'no_action_taken')
    .slice(0, limit)
    .map((item, index) => ({
      id: `action-${index}`,
      label: parseWhy(item),
      who: parseWho(item.title, item),
    }));
}
