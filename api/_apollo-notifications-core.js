import {
  buildNegativeStockNotifications,
  summarizeNegativeStock,
} from './_apollo-negative-stock-rules.js';

const DAY_MS = 86_400_000;
const INACTIVE_ORDER_DAYS = 2;
const APPROACHING_DUE_DAYS = 2;

function asDate(value) {
  if (!value) return null;
  const d = new Date(String(value).includes('T') ? value : `${value}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfToday(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysBetween(a, b) {
  return Math.floor((startOfToday(a).getTime() - startOfToday(b).getTime()) / DAY_MS);
}

function daysUntil(value, now = new Date()) {
  const d = asDate(value);
  if (!d) return null;
  return daysBetween(d, now);
}

function daysSince(value, now = new Date()) {
  const d = asDate(value);
  if (!d) return null;
  return Math.max(0, daysBetween(now, d));
}

function customerName(workspace) {
  return workspace?.customer?.customer_name || workspace?.command?.replace(/^\/order\s*/i, '') || 'Order workspace';
}

function actionUrl(workspaceId) {
  return `/apollo/orders/${workspaceId}`;
}

function notification({
  dedupeKey,
  sourceType,
  sourceId,
  workspace,
  category,
  severity,
  title,
  detail = '',
  recommendation = '',
  actionLabel = 'Open order workspace',
  priorityScore = 50,
  dueAt = null,
  payload = {},
}) {
  return {
    dedupeKey,
    sourceType,
    sourceId,
    workspaceId: workspace.id,
    category,
    severity,
    title,
    detail,
    recommendation,
    actionLabel,
    actionUrl: actionUrl(workspace.id),
    priorityScore,
    dueAt,
    payload,
  };
}

function openOnly(rows = []) {
  return rows.filter((row) => String(row.status || '').toLowerCase() === 'open');
}

export function buildOrderWorkspaceNotifications(workspaces = [], { now = new Date() } = {}) {
  const items = [];

  for (const workspace of workspaces) {
    if (!workspace || workspace.status === 'Closed') continue;
    const name = customerName(workspace);
    const dueIn = daysUntil(workspace.due_date, now);
    const inactiveDays = daysSince(workspace.updated_at || workspace.created_at, now);

    if (dueIn != null && dueIn < 0) {
      items.push(notification({
        dedupeKey: `order:${workspace.id}:overdue`,
        sourceType: 'order_workspace',
        sourceId: workspace.id,
        workspace,
        category: 'orders_overdue',
        severity: 'urgent',
        title: `${name} order is overdue`,
        detail: `Due ${Math.abs(dueIn)} day${Math.abs(dueIn) === 1 ? '' : 's'} ago · status ${workspace.status}`,
        recommendation: 'Review the order today and decide the next action.',
        priorityScore: 98,
        dueAt: workspace.due_date,
      }));
    } else if (dueIn != null && dueIn <= APPROACHING_DUE_DAYS) {
      items.push(notification({
        dedupeKey: `order:${workspace.id}:approaching-due`,
        sourceType: 'order_workspace',
        sourceId: workspace.id,
        workspace,
        category: 'approaching_due_dates',
        severity: 'attention',
        title: `${name} order is due soon`,
        detail: dueIn === 0 ? 'Due today' : `Due in ${dueIn} day${dueIn === 1 ? '' : 's'}`,
        recommendation: 'Check whether tasks, commitments, and supplier steps are still on track.',
        priorityScore: 76,
        dueAt: workspace.due_date,
      }));
    }

    if (inactiveDays != null && inactiveDays >= INACTIVE_ORDER_DAYS) {
      items.push(notification({
        dedupeKey: `order:${workspace.id}:inactive`,
        sourceType: 'order_workspace',
        sourceId: workspace.id,
        workspace,
        category: 'inactive_orders',
        severity: 'attention',
        title: `${name} order has been inactive for ${inactiveDays} days`,
        detail: `Last updated ${inactiveDays} day${inactiveDays === 1 ? '' : 's'} ago · status ${workspace.status}`,
        recommendation: 'Open the workspace and either progress it, add a reminder, or close it.',
        priorityScore: Math.min(90, 58 + inactiveDays * 4),
      }));
    }

    for (const task of openOnly(workspace.tasks)) {
      const due = daysUntil(task.due_date, now);
      if (due != null && due < 0) {
        items.push(notification({
          dedupeKey: `task:${task.id}:overdue`,
          sourceType: 'order_workspace_task',
          sourceId: task.id,
          workspace,
          category: 'open_tasks',
          severity: 'urgent',
          title: `Task overdue: ${task.title}`,
          detail: `${name} · due ${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} ago`,
          recommendation: 'Complete it or update the due date with a reason.',
          priorityScore: 92,
          dueAt: task.due_date,
          payload: { owner: task.owner || '' },
        }));
      }
    }

    for (const commitment of openOnly(workspace.commitments || workspace.promises)) {
      const due = daysUntil(commitment.due_date, now);
      if (due != null && due < 0) {
        items.push(notification({
          dedupeKey: `commitment:${commitment.id}:overdue`,
          sourceType: 'order_workspace_commitment',
          sourceId: commitment.id,
          workspace,
          category: 'overdue_commitments',
          severity: 'urgent',
          title: `Commitment overdue: ${commitment.promise_text || commitment.commitment_text}`,
          detail: `${name} · due ${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'} ago`,
          recommendation: 'Either fulfil the commitment or record the next customer/supplier update.',
          priorityScore: 96,
          dueAt: commitment.due_date,
          payload: { madeTo: commitment.made_to || '' },
        }));
      }
    }

    for (const reminder of openOnly(workspace.reminders)) {
      const due = daysUntil(reminder.due_date, now);
      if (due != null && due <= 0) {
        items.push(notification({
          dedupeKey: `reminder:${reminder.id}:due`,
          sourceType: 'order_workspace_reminder',
          sourceId: reminder.id,
          workspace,
          category: 'due_reminders',
          severity: due < 0 ? 'urgent' : 'attention',
          title: `Reminder due: ${reminder.title}`,
          detail: due < 0 ? `${name} · overdue by ${Math.abs(due)} day${Math.abs(due) === 1 ? '' : 's'}` : `${name} · due today`,
          recommendation: 'Act on the reminder or reschedule it deliberately.',
          priorityScore: due < 0 ? 90 : 72,
          dueAt: reminder.due_date,
        }));
      }
    }
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore || String(a.title).localeCompare(String(b.title)));
}

export function buildBuyingSupplierNotifications({ inventory = {}, sales = null, existingByKey = null, now = new Date() } = {}) {
  const items = [];
  const negative = inventory.lists?.negative || [];
  const zero = inventory.lists?.zero || [];
  const low = inventory.lists?.low || [];
  const salesItems = sales?.results || sales?.items || [];
  const salesByCode = new Map(salesItems.map((item, index) => [
    String(item.code || item.sku || '').trim().toUpperCase(),
    { ...item, rank: index + 1 },
  ]).filter(([code]) => code));

  const negativeSummary = summarizeNegativeStock(negative, { sales, existingByKey, now });
  items.push(...buildNegativeStockNotifications(negative, { sales, existingByKey, now }));

  const attentionProducts = [
    ...zero.map((p) => ({ ...p, stockBucket: 'zero', basePriority: 84, severity: 'attention' })),
    ...low.map((p) => ({ ...p, stockBucket: 'low', basePriority: 72, severity: 'attention' })),
  ];

  for (const product of attentionProducts.slice(0, 10)) {
    const code = String(product.sku || product.code || '').trim().toUpperCase();
    if (!code) continue;
    const sale = salesByCode.get(code);
    const salesBoost = sale ? Math.max(4, 18 - sale.rank) : 0;
    const supplier = product.supplier || 'Unknown supplier';
    const qty = product.stockQty ?? product.stockOnHand;
    const recommendation = sale
      ? `Review buying today. This item is selling now and stock is ${product.stockBucket === 'negative' ? 'below zero' : qty}.`
      : `Review buying or listing status. Stock is ${product.stockBucket === 'negative' ? 'below zero' : qty}.`;
    items.push({
      dedupeKey: `buying:${code}:${product.stockBucket}`,
      sourceType: 'buying_signal',
      sourceId: null,
      workspaceId: null,
      category: 'buying_review_due',
      severity: product.severity,
      title: `Buying review: ${code} · ${product.title || code}`,
      detail: `${code} · ${supplier} · stock ${qty ?? 'unknown'}${sale ? ` · sales rank #${sale.rank}` : ''}`,
      recommendation,
      actionLabel: 'Review product',
      actionUrl: '',
      priorityScore: Math.min(99, product.basePriority + salesBoost),
      dueAt: null,
      payload: { code, supplier, stockBucket: product.stockBucket, salesRank: sale?.rank || null, query: `Show product ${code}` },
    });
  }

  const supplierMap = new Map();
  const supplierAttentionProducts = [
    ...negativeSummary.investigate,
    ...attentionProducts,
  ];

  for (const product of supplierAttentionProducts) {
    const supplier = String(product.supplier || '').trim();
    if (!supplier) continue;
    const current = supplierMap.get(supplier) || { supplier, products: [], urgent: 0 };
    current.products.push(product);
    if (product.stockBucket === 'negative_investigate' || product.kind === 'investigate') {
      current.urgent += 1;
    }
    supplierMap.set(supplier, current);
  }

  for (const group of [...supplierMap.values()]
    .filter((g) => g.products.length >= 2 || g.urgent > 0)
    .sort((a, b) => (b.urgent - a.urgent) || (b.products.length - a.products.length))
    .slice(0, 6)) {
    const severity = group.urgent ? 'urgent' : 'attention';
    items.push({
      dedupeKey: `supplier:${group.supplier}:stock-attention`,
      sourceType: 'supplier_signal',
      sourceId: null,
      workspaceId: null,
      category: 'supplier_followups',
      severity,
      title: `Supplier follow-up: ${group.supplier}`,
      detail: `${group.products.length} product${group.products.length === 1 ? '' : 's'} need stock or buying attention`,
      recommendation: 'Check outstanding buying decisions and follow up with the supplier before orders slip.',
      actionLabel: 'Review supplier',
      actionUrl: '',
      priorityScore: severity === 'urgent' ? 88 : 70,
      dueAt: null,
      payload: { supplier: group.supplier, query: group.supplier },
    });
  }

  return items.sort((a, b) => b.priorityScore - a.priorityScore || String(a.title).localeCompare(String(b.title)));
}

export function notificationCounts(items = []) {
  const counts = {
    total: items.length,
    urgent: 0,
    attention: 0,
    critical: 0,
    action: 0,
    review: 0,
    byCategory: {},
    bySeverity: {},
  };
  for (const item of items) {
    const severity = item.severity;
    if (severity === 'urgent' || severity === 'critical') counts.urgent += 1;
    if (severity === 'attention' || severity === 'review' || severity === 'action') counts.attention += 1;
    if (severity === 'critical') counts.critical += 1;
    if (severity === 'action') counts.action += 1;
    if (severity === 'review') counts.review += 1;
    counts.byCategory[item.category] = (counts.byCategory[item.category] || 0) + 1;
    counts.bySeverity[severity] = (counts.bySeverity[severity] || 0) + 1;
  }
  return counts;
}

export function businessHealthScore(items = []) {
  const penalty = items.reduce((sum, item) => {
    if (item.category === 'stock_timing' || item.payload?.negativeStockClass === 'temporary_timing' || item.payload?.negativeStockClass === 'grv_in_progress') {
      return sum + 0.04;
    }
    if (item.severity === 'critical') return sum + 0.6;
    if (item.severity === 'urgent' || item.severity === 'action') return sum + 0.45;
    if (item.severity === 'attention' || item.severity === 'review') return sum + 0.22;
    return sum + 0.08;
  }, 0);
  return Math.max(0, Math.round((10 - penalty) * 10) / 10);
}

export function notificationToFocus(item, priority) {
  const confidence = item.payload?.confidence ?? item.confidence;
  const impact = item.payload?.businessImpact || item.businessImpact || item.business_impact;
  const evidence = item.payload?.evidence || item.evidence || [];
  const isException = String(item.dedupeKey || item.dedupe_key || '').startsWith('exception:')
    || item.payload?.release === 'apollo-operational-v1.2';
  const evidenceText = Array.isArray(evidence) && evidence.length
    ? evidence.slice(0, 2).map((row) => `${row.label}: ${row.value}`).join(' · ')
    : item.detail;
  return {
    type: `notification_${item.category}`,
    priority,
    severity: item.severity,
    title: item.title,
    label: item.title,
    detail: item.detail,
    why: isException
      ? `Apollo detected a meaningful business exception${confidence ? ` with ${confidence}% confidence` : ''}${impact ? ` · impact ${impact}` : ''}.`
      : 'Apollo found an operational item that may be forgotten.',
    action: item.recommendation || item.actionLabel,
    evidence: evidenceText,
    confidence,
    businessImpact: impact,
    workspace: item.workspaceId ? 'orders' : 'apollo',
    url: item.actionUrl,
    query: item.payload?.query || item.actionQuery || null,
    code: item.payload?.code || null,
    sku: item.payload?.code || null,
    notificationId: item.id || item.dedupeKey,
    notificationDbId: item.id || null,
    detectedAt: item.detectedAt || item.detected_at || item.lastSeenAt || item.last_seen_at || new Date().toISOString(),
    priorityScore: item.priorityScore || item.priority_score || null,
    payload: item.payload || {},
    feedbackStatus: item.feedbackStatus || item.feedback_status || null,
    businessValue: item.businessValue || item.business_value || null,
    decisionOutcome: item.decisionOutcome || item.decision_outcome || null,
    feedbackNote: item.feedbackNote || item.feedback_note || '',
  };
}

