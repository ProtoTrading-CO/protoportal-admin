import { requireAdminKey } from './_admin-auth.js';
import { getPortalAdminClient } from './_site-config.js';
import {
  buildBuyingSupplierNotifications,
  buildOrderWorkspaceNotifications,
  businessHealthScore,
  notificationCounts,
} from './_apollo-notifications-core.js';
import { executeQuery } from './intelligence/query-engine/execute.js';
import { buildInventoryContext } from './intelligence/bi/contexts/inventory.js';

const WORKSPACE_SELECT = 'id,status,priority,command,due_date,supplier,notes,created_at,updated_at';

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

export async function generateApolloNotifications({ supabase = getPortalAdminClient(), persist = false, now = new Date(), includeAdvisory = persist } = {}) {
  const source = await loadWorkspaceNotificationSource(supabase);
  const generated = [
    ...buildOrderWorkspaceNotifications(source, { now }),
    ...(includeAdvisory ? await loadBuyingSupplierNotificationSource({ bypassCache: true }) : []),
  ].sort((a, b) => b.priorityScore - a.priorityScore || String(a.title).localeCompare(String(b.title)));

  if (persist && generated.length) {
    const rows = generated.map((item) => ({
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
      status: 'open',
      priority_score: item.priorityScore,
      due_at: item.dueAt || null,
      last_seen_at: new Date().toISOString(),
      payload: item.payload || {},
    }));
    const { error } = await supabase
      .from('apollo_notifications')
      .upsert(rows, { onConflict: 'dedupe_key' });
    if (error) throw error;
  }

  return {
    items: generated,
    counts: notificationCounts(generated),
    businessHealthScore: businessHealthScore(generated),
  };
}

async function listOpenNotifications(supabase, limit = 50) {
  const { data, error } = await supabase
    .from('apollo_notifications')
    .select('*')
    .eq('status', 'open')
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
      const { id, status } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id required' });
      if (!['open', 'resolved', 'dismissed'].includes(status)) return res.status(400).json({ error: 'Invalid notification status' });
      const { data, error } = await supabase
        .from('apollo_notifications')
        .update({ status, updated_at: new Date().toISOString() })
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

