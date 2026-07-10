import { requireAdminKey } from './_admin-auth.js';
import { getPortalAdminClient } from './_site-config.js';
import {
  buildBuyingSupplierNotifications,
  buildOrderWorkspaceNotifications,
  businessHealthScore,
  notificationCounts,
} from './_apollo-notifications-core.js';
import { buildBusinessExceptions } from './_apollo-exception-engine.js';
import {
  buildAuditSnapshot,
  buildDailyBriefScore,
  buildValidationReport,
  partitionRowsByDay,
} from './_apollo-validation-metrics.js';
import { executeQuery } from './intelligence/query-engine/execute.js';
import { buildInventoryContext } from './intelligence/bi/contexts/inventory.js';

export { buildValidationReport } from './_apollo-validation-metrics.js';

const VALIDATION_ROW_SELECT = 'id,category,dedupe_key,title,recommendation,confidence,business_impact,feedback_status,feedback_note,business_value,decision_outcome,audit_snapshot,payload,created_at,detected_at';

const WORKSPACE_SELECT = 'id,status,priority,command,due_date,supplier,notes,created_at,updated_at';
const ACTIVE_NOTIFICATION_STATUSES = ['open', 'acknowledged'];
const SUPPRESSED_NOTIFICATION_STATUSES = ['resolved', 'dismissed'];
const FEEDBACK_STATUSES = ['useful', 'false_positive', 'needs_threshold_adjustment', 'ignore_permanently'];
const BUSINESS_VALUES = ['high', 'medium', 'low', 'none'];
const DECISION_OUTCOMES = ['no_action_taken', 'investigated', 'action_taken', 'escalated'];

function migrationError(err) {
  return /apollo_notifications|order_workspace|does not exist|Could not find the table/i.test(String(err?.message || ''));
}

async function loadWorkspaceNotificationSource(supabase) {
  const { data: workspaces, error } = await supabase
    .from('order_workspaces')
    .select(WORKSPACE_SELECT)
    .neq('status', 'Closed')
    .order('updated_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  const ids = (workspaces || []).map((w) => w.id);
  if (!ids.length) return [];

  const [customers, tasks, commitments, reminders] = await Promise.all([
    supabase.from('order_workspace_customers').select('*').in('workspace_id', ids),
    supabase.from('order_workspace_tasks').select('*').in('workspace_id', ids).eq('status', 'Open'),
    supabase.from('order_workspace_promises').select('*').in('workspace_id', ids).eq('status', 'Open'),
    supabase.from('order_workspace_reminders').select('*').in('workspace_id', ids).eq('status', 'Open'),
  ]);
  for (const result of [customers, tasks, commitments, reminders]) {
    if (result.error) throw result.error;
  }

  const byWorkspace = (rows = []) => rows.reduce((map, row) => {
    const key = row.workspace_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
    return map;
  }, new Map());
  const customerByWorkspace = new Map((customers.data || []).map((row) => [row.workspace_id, row]));
  const taskMap = byWorkspace(tasks.data || []);
  const commitmentMap = byWorkspace(commitments.data || []);
  const reminderMap = byWorkspace(reminders.data || []);

  return (workspaces || []).map((workspace) => ({
    ...workspace,
    customer: customerByWorkspace.get(workspace.id) || null,
    tasks: taskMap.get(workspace.id) || [],
    commitments: commitmentMap.get(workspace.id) || [],
    reminders: reminderMap.get(workspace.id) || [],
  }));
}

async function loadBuyingSupplierNotificationSource(ctx = {}) {
  try {
    const inventoryEnv = await buildInventoryContext({ type: 'all', limit: 10, threshold: 10 }, ctx);
    if (!inventoryEnv.ok) return [];
    let sales = null;
    const salesRes = await executeQuery('erp.top_line_items', { period: 'last_week', scope: 'top_sellers', limit: 15 }, ctx);
    if (salesRes.ok) sales = salesRes.data;
    return buildBuyingSupplierNotifications({ inventory: inventoryEnv.data, sales });
  } catch (err) {
    console.warn('apollo-notifications advisory source unavailable:', err?.message || err);
    return [];
  }
}

async function bestSalesContext(ctx = {}) {
  const periods = ['yesterday', 'last_week'];
  const data = {};
  for (const period of periods) {
    const erp = await executeQuery('erp.top_line_items', { period, scope: 'top_sellers', limit: 15 }, ctx);
    if (erp.ok) {
      data[period] = erp.data;
      continue;
    }
    const portal = await executeQuery('portal.top_line_items', { period, scope: 'top_sellers', limit: 15 }, ctx);
    if (portal.ok) data[period] = portal.data;
  }
  return data;
}

async function loadProductComparisonSource(codes = [], ctx = {}) {
  const unique = [...new Set(codes.map((code) => String(code || '').trim().toUpperCase()).filter(Boolean))].slice(0, 12);
  const rows = [];
  await Promise.all(unique.map(async (code) => {
    const [erpRes, websiteRes] = await Promise.all([
      executeQuery('erp.product_by_code', { code }, ctx),
      executeQuery('stock.website_stock_by_sku', { sku: code }, ctx),
    ]);
    rows.push({
      code,
      erp: erpRes.ok ? erpRes.data?.product : null,
      website: websiteRes.ok ? websiteRes.data?.listing : null,
    });
  }));
  return rows;
}

function stockCoverSource(inventory, sales) {
  const salesByCode = new Map((sales?.last_week?.items || []).map((item) => [String(item.code || item.sku || '').trim().toUpperCase(), item]));
  const products = [
    ...(inventory?.lists?.negative || []),
    ...(inventory?.lists?.zero || []),
    ...(inventory?.lists?.low || []),
  ].map((product) => {
    const code = String(product.sku || product.code || '').trim().toUpperCase();
    const sale = salesByCode.get(code);
    return {
      ...product,
      code,
      stockQty: product.stockQty ?? product.stockOnHand,
      dailySalesVelocity: sale ? Number(sale.totalQty || 0) / 7 : 0,
      salesSampleDays: sale ? 7 : 0,
      leadTimeDays: 35,
    };
  });
  return { products };
}

function customerExceptionSource(orders = []) {
  const byCustomer = new Map();
  for (const order of orders) {
    const key = order.customerId || order.customer;
    if (!key) continue;
    const current = byCustomer.get(key) || {
      id: key,
      name: order.customer,
      orderCount: 0,
      totalSpend: 0,
      values: [],
      dates: [],
    };
    current.orderCount += 1;
    current.totalSpend += Number(order.totalExVat) || 0;
    current.values.push(Number(order.totalExVat) || 0);
    current.dates.push(new Date(order.createdAt));
    byCustomer.set(key, current);
  }

  const now = Date.now();
  const customers = [...byCustomer.values()].map((customer) => {
    const dates = customer.dates.sort((a, b) => b - a);
    const gaps = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push(Math.max(1, Math.round((dates[i] - dates[i + 1]) / 86_400_000)));
    }
    const latest = dates[0];
    const latestValue = customer.values[0] || 0;
    const avgValue = customer.values.reduce((sum, value) => sum + value, 0) / Math.max(1, customer.values.length);
    return {
      ...customer,
      normalOrderGapDays: gaps.length ? Math.round(gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) : 0,
      daysSinceLastOrder: latest ? Math.round((now - latest.getTime()) / 86_400_000) : 0,
      averageOrderValue: Math.round(avgValue),
      latestOrderValue: Math.round(latestValue),
    };
  });
  return { customers };
}

function supplierExceptionSource(workspaces = []) {
  const bySupplier = new Map();
  for (const workspace of workspaces) {
    const supplier = String(workspace.supplier || '').trim();
    if (!supplier) continue;
    const current = bySupplier.get(supplier) || {
      supplier,
      lateDeliveries: 0,
      outstandingCommitments: 0,
      averageLeadTimeDays: 0,
      normalLeadTimeDays: 35,
    };
    if (workspace.due_date && new Date(workspace.due_date) < new Date() && workspace.status !== 'Closed') current.lateDeliveries += 1;
    current.outstandingCommitments += (workspace.commitments || []).length;
    if (workspace.status === 'Waiting Supplier') current.outstandingCommitments += 1;
    current.averageLeadTimeDays = Math.max(current.averageLeadTimeDays, 42);
    bySupplier.set(supplier, current);
  }
  return { suppliers: [...bySupplier.values()] };
}

async function loadExceptionNotificationSource(workspaces, ctx = {}) {
  try {
    const [inventoryEnv, sales, ordersRes] = await Promise.all([
      buildInventoryContext({ type: 'all', limit: 10, threshold: 10 }, ctx),
      bestSalesContext(ctx),
      executeQuery('portal.orders_recent', { limit: 100 }, ctx),
    ]);
    const inventory = inventoryEnv.ok ? inventoryEnv.data : { lists: {} };
    const salesCodes = [
      ...(sales.yesterday?.items || []),
      ...(sales.last_week?.items || []),
      ...(inventory.lists?.negative || []),
      ...(inventory.lists?.zero || []),
      ...(inventory.lists?.low || []),
    ].map((item) => item.code || item.sku);
    const erpWebsite = { products: await loadProductComparisonSource(salesCodes, ctx) };
    return buildBusinessExceptions({
      sales: { today: sales.yesterday?.items || [], baseline: sales.last_week?.items || [] },
      erpWebsite,
      stockCover: stockCoverSource(inventory, sales),
      customers: customerExceptionSource(ordersRes.ok ? ordersRes.data?.orders || [] : []),
      suppliers: supplierExceptionSource(workspaces),
    });
  } catch (err) {
    console.warn('apollo exception source unavailable:', err?.message || err);
    return [];
  }
}

async function loadExistingNotifications(supabase, dedupeKeys = []) {
  if (!dedupeKeys.length) return new Map();
  const { data, error } = await supabase
    .from('apollo_notifications')
    .select('id,dedupe_key,status,feedback_status,feedback_note,feedback_by,feedback_at,business_value,decision_outcome,audit_snapshot,confidence,business_impact,evidence,recommendation,detail,title,category')
    .in('dedupe_key', dedupeKeys);
  if (error) throw error;
  return new Map((data || []).map((row) => [row.dedupe_key, row]));
}

function withExistingState(item, existing) {
  if (!existing) return item;
  return {
    ...item,
    id: existing.id,
    status: existing.status,
    feedbackStatus: existing.feedback_status || null,
    feedbackNote: existing.feedback_note || '',
    feedbackBy: existing.feedback_by || '',
    feedbackAt: existing.feedback_at || null,
    businessValue: existing.business_value || null,
    decisionOutcome: existing.decision_outcome || null,
  };
}

function notificationRow(item, status = 'open') {
  const row = {
    dedupe_key: item.dedupeKey,
    source_type: item.sourceType,
    source_id: item.sourceId,
    workspace_id: item.workspaceId,
    category: item.category,
    severity: item.severity,
    title: item.title,
    detail: item.detail,
    recommendation: item.recommendation,
    action_label: item.actionLabel,
    action_url: item.actionUrl,
    status,
    priority_score: item.priorityScore,
    due_at: item.dueAt || null,
    last_seen_at: new Date().toISOString(),
    payload: item.payload || {},
    confidence: item.payload?.confidence ?? null,
    business_impact: item.payload?.businessImpact || null,
    evidence: item.payload?.evidence || [],
  };
  if (item.payload?.release === 'apollo-operational-v1.2' || String(item.dedupeKey || '').startsWith('exception:')) {
    row.audit_snapshot = buildAuditSnapshot(item);
  }
  return row;
}

function mutableNotificationPatch(item, existing) {
  return {
    id: existing.id,
    priority_score: item.priorityScore,
    last_seen_at: new Date().toISOString(),
    status: existing.status,
  };
}

async function persistGeneratedNotifications(supabase, generated, existingByKey) {
  if (!generated.length) return;
  const newRows = [];
  const updateRows = [];

  for (const item of generated) {
    const existing = existingByKey.get(item.dedupeKey);
    if (!existing) {
      newRows.push(notificationRow(item));
      continue;
    }
    if (SUPPRESSED_NOTIFICATION_STATUSES.includes(existing.status) || existing.feedback_status === 'ignore_permanently') continue;
    updateRows.push(mutableNotificationPatch(item, existing));
  }

  if (newRows.length) {
    const { error } = await supabase.from('apollo_notifications').insert(newRows);
    if (error) throw error;
  }

  for (const row of updateRows) {
    const { id, ...patch } = row;
    const { error } = await supabase.from('apollo_notifications').update(patch).eq('id', id);
    if (error) throw error;
  }
}

export async function loadDailyBriefValidationScore(supabase = getPortalAdminClient()) {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 2);
  const { data, error } = await supabase
    .from('apollo_notifications')
    .select(VALIDATION_ROW_SELECT)
    .gte('detected_at', since.toISOString())
    .order('detected_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  const { todayRows, yesterdayRows } = partitionRowsByDay(data || []);
  return buildDailyBriefScore({ todayRows, yesterdayRows });
}

export async function generateApolloNotifications({ supabase = getPortalAdminClient(), persist = false, now = new Date(), includeAdvisory = persist, includeExceptions = true } = {}) {
  const source = await loadWorkspaceNotificationSource(supabase);
  const generated = [
    ...buildOrderWorkspaceNotifications(source, { now }),
    ...(includeAdvisory ? await loadBuyingSupplierNotificationSource({ bypassCache: true }) : []),
    ...(includeExceptions ? await loadExceptionNotificationSource(source, { bypassCache: true }) : []),
  ].sort((a, b) => b.priorityScore - a.priorityScore || String(a.title).localeCompare(String(b.title)));

  const existingByKey = await loadExistingNotifications(supabase, generated.map((item) => item.dedupeKey));
  if (persist) await persistGeneratedNotifications(supabase, generated, existingByKey);
  const visible = generated
    .filter((item) => {
      const existing = existingByKey.get(item.dedupeKey);
      return !SUPPRESSED_NOTIFICATION_STATUSES.includes(existing?.status) && existing?.feedback_status !== 'ignore_permanently';
    })
    .map((item) => withExistingState(item, existingByKey.get(item.dedupeKey)));

  return {
    items: visible,
    counts: notificationCounts(visible),
    businessHealthScore: businessHealthScore(visible),
  };
}

async function validationReport(supabase, days = 7) {
  const periodDays = Math.min(31, Math.max(1, Number(days) || 7));
  const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from('apollo_notifications')
    .select(VALIDATION_ROW_SELECT)
    .gte('detected_at', since)
    .order('detected_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return buildValidationReport(data || [], { days: periodDays });
}

async function listOpenNotifications(supabase, limit = 50) {
  const { data, error } = await supabase
    .from('apollo_notifications')
    .select('*')
    .in('status', ACTIVE_NOTIFICATION_STATUSES)
    .or('feedback_status.is.null,feedback_status.neq.ignore_permanently')
    .order('priority_score', { ascending: false })
    .order('detected_at', { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(limit) || 50)));
  if (error) throw error;
  return data || [];
}

export default async function handler(req, res) {
  if (!(await requireAdminKey(req, res))) return;
  res.setHeader('Cache-Control', 'no-store');
  const supabase = getPortalAdminClient();

  try {
    if (req.method === 'GET') {
      if (req.query?.report === 'validation') {
        const report = await validationReport(supabase, req.query?.days);
        return res.status(200).json({ report });
      }
      const generate = req.query?.generate === '1';
      if (generate) {
        const result = await generateApolloNotifications({ supabase, persist: true });
        return res.status(200).json(result);
      }
      const rows = await listOpenNotifications(supabase, req.query?.limit);
      return res.status(200).json({
        rows,
        counts: notificationCounts(rows.map((row) => ({
          severity: row.severity,
          category: row.category,
        }))),
      });
    }

    if (req.method === 'PATCH') {
      const {
        id,
        status,
        feedback,
        businessValue,
        decisionOutcome,
        note = '',
      } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      const patch = { updated_at: new Date().toISOString() };
      if (status != null) {
        if (![...ACTIVE_NOTIFICATION_STATUSES, ...SUPPRESSED_NOTIFICATION_STATUSES].includes(status)) return res.status(400).json({ error: 'Invalid notification status' });
        patch.status = status;
      }
      if (feedback != null) {
        if (!FEEDBACK_STATUSES.includes(feedback)) return res.status(400).json({ error: 'Invalid notification feedback' });
        patch.feedback_status = feedback;
        patch.feedback_note = String(note || '').slice(0, 500);
        patch.feedback_by = req.headers['x-admin-email'] || 'apollo';
        patch.feedback_at = new Date().toISOString();
        if (feedback === 'ignore_permanently') patch.status = 'dismissed';
      }
      if (businessValue != null) {
        if (!BUSINESS_VALUES.includes(businessValue)) return res.status(400).json({ error: 'Invalid business value' });
        patch.business_value = businessValue;
      }
      if (decisionOutcome != null) {
        if (!DECISION_OUTCOMES.includes(decisionOutcome)) return res.status(400).json({ error: 'Invalid decision outcome' });
        patch.decision_outcome = decisionOutcome;
      }
      if (status == null && feedback == null && businessValue == null && decisionOutcome == null) {
        return res.status(400).json({ error: 'status, feedback, businessValue, or decisionOutcome required' });
      }
      if (feedback != null && !String(note || '').trim()) {
        return res.status(400).json({ error: 'Explanation required when recording feedback' });
      }
      const { data: existing, error: existingError } = await supabase
        .from('apollo_notifications')
        .select('*')
        .eq('id', id)
        .single();
      if (existingError) throw existingError;
      if (!existing.audit_snapshot && (feedback != null || businessValue != null || decisionOutcome != null)) {
        patch.audit_snapshot = buildAuditSnapshot({
          category: existing.category,
          title: existing.title,
          detail: existing.detail,
          recommendation: existing.recommendation,
          confidence: existing.confidence,
          business_impact: existing.business_impact,
          evidence: existing.evidence,
          payload: existing.payload,
        });
      }
      const { data, error } = await supabase
        .from('apollo_notifications')
        .update(patch)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return res.status(200).json({ row: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (migrationError(err)) {
      return res.status(501).json({
        error: 'Apollo notifications migration not applied',
        migrationRequired: true,
        migration: 'migrations/045_apollo_notifications.sql',
      });
    }
    return res.status(400).json({ error: err.message || 'Apollo notification request failed' });
  }
}

