import { loadWorkspace } from '../../../order-workspaces.js';

const WORKSPACE_SELECT = 'id,status,priority,command,customer_id,due_date,supplier,notes,created_by,created_at,updated_at,archived_at';

const COMPLETED_STATUSES = new Set(['Closed']);

export function isActiveWorkspace(workspace) {
  if (!workspace) return false;
  if (workspace.archived_at) return false;
  return !COMPLETED_STATUSES.has(workspace.status);
}

function pickRelevantWorkspace(rows, hints = {}) {
  const list = Array.isArray(rows) ? rows.filter(isActiveWorkspace) : [];
  if (!list.length) return null;

  const customerId = hints.customerId || null;
  const customerName = String(hints.customerName || '').trim().toLowerCase();

  if (customerId) {
    const byId = list.find((row) => row.customer_id === customerId);
    if (byId) return byId;
  }

  if (customerName) {
    const byName = list.find((row) => {
      const command = String(row.command || '').toLowerCase();
      return command.includes(customerName);
    });
    if (byName) return byName;
  }

  return list[0];
}

/**
 * Load the active workspace using conversation hints, then recent non-completed workspaces.
 */
export async function resolveActiveWorkspace(supabase, conversationContext = {}) {
  const hints = {
    customerId: conversationContext?.previousEntity?.entityType === 'customer'
      ? conversationContext.previousEntity.entityId
      : conversationContext?.proposedAction?.customerId || null,
    customerName: conversationContext?.proposedAction?.customerName || null,
  };

  const explicitId = conversationContext?.activeWorkspaceId
    || conversationContext?.proposedAction?.workspaceId
    || conversationContext?.previousWorkspaceId
    || null;

  if (explicitId) {
    const loaded = await loadWorkspace(supabase, explicitId);
    if (isActiveWorkspace(loaded)) {
      return { workspace: loaded, source: 'conversation' };
    }
  }

  const { data, error } = await supabase
    .from('order_workspaces')
    .select(WORKSPACE_SELECT)
    .not('status', 'eq', 'Closed')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) throw error;

  const workspace = pickRelevantWorkspace(data, hints);
  if (!workspace) {
    return { workspace: null, source: null };
  }

  const loaded = await loadWorkspace(supabase, workspace.id);
  return {
    workspace: isActiveWorkspace(loaded) ? loaded : null,
    source: 'workspace',
  };
}

export function buildInheritedWorkspaceData(workspace) {
  if (!workspace) return {};

  return {
    workspaceId: workspace.id,
    status: workspace.status,
    supplier: workspace.supplier || null,
    dueDate: workspace.due_date || null,
    priority: workspace.priority || null,
    command: workspace.command || '',
    lines: workspace.lines || [],
    timeline: workspace.timeline || [],
    promises: workspace.promises || [],
    reminders: workspace.reminders || [],
    tasks: workspace.tasks || [],
    deadlines: workspace.deadlines || null,
  };
}
