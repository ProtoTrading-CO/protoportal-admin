import { randomUUID } from 'node:crypto';
import { parseOrderCreatePhrase } from '../../abl/order-create.js';
import { parseCustomerSelection, isCancellationMessage } from '../confirmation.js';
import {
  formatActionCancelled,
  formatDuplicateExecution,
  formatMissingCustomerQuery,
  formatOrderAmbiguity,
  formatOrderCreateProposal,
  formatOrderWorkspaceCreated,
  formatUnknownCustomer,
} from '../format.js';
import { normalizeLine, resolveCustomerMatch } from '../../../_order-workspace-core.js';
import { createWorkspace, findCustomers, addWorkspaceLine } from '../../../order-workspaces.js';

const ACTION_SOURCE = 'apollo-action';

/**
 * @typedef {object} ProposedAction
 * @property {string} actionId
 * @property {'order_workspace_create'} type
 * @property {'proposed'|'select_customer'|'executed'} status
 * @property {number} confidence
 * @property {string} reason
 * @property {boolean} requiresConfirmation
 * @property {string} customerQuery
 * @property {string} command
 * @property {string|null} customerId
 * @property {string|null} customerName
 * @property {Array<{requestedQty:number,description:string}>} proposedLines
 * @property {string} phrase
 * @property {Array<object>} [matches]
 * @property {string} [workspaceId]
 * @property {string} createdAt
 */

function customerMatchMeta(customer, customerQuery) {
  const q = String(customerQuery || '').trim().toLowerCase();
  const label = customer.business_name || customer.name || customerQuery;
  const fields = [customer.business_name, customer.name, customer.contact_name, customer.email, customer.customer_code]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  if (fields.some((v) => v === q)) {
    return { confidence: 0.99, reason: `Matched customer '${label}'` };
  }
  if (q.length >= 4 && fields.some((v) => v.includes(q))) {
    return { confidence: 0.88, reason: `Matched customer '${label}'` };
  }
  return { confidence: 0.72, reason: `Likely customer '${label}'` };
}

export function buildProposedAction(fields = {}) {
  return {
    actionId: fields.actionId || randomUUID(),
    type: fields.type || 'order_workspace_create',
    status: fields.status || 'proposed',
    confidence: fields.confidence ?? 0.5,
    reason: fields.reason || 'Action proposed',
    requiresConfirmation: fields.requiresConfirmation !== false,
    customerQuery: fields.customerQuery || '',
    command: fields.command || '',
    customerId: fields.customerId || null,
    customerName: fields.customerName || null,
    proposedLines: fields.proposedLines || [],
    phrase: fields.phrase || 'unknown',
    matches: fields.matches || undefined,
    workspaceId: fields.workspaceId || null,
    createdAt: fields.createdAt || new Date().toISOString(),
  };
}

export function detectOrderCreateIntent(query) {
  return parseOrderCreatePhrase(query);
}

export async function proposeOrderWorkspaceCreate(ctx, parsed) {
  const { supabase } = ctx;
  if (!parsed.customerQuery) {
    return {
      reply: formatMissingCustomerQuery(),
      source: ACTION_SOURCE,
      intent: 'order_workspace_missing_customer',
    };
  }

  const matches = await findCustomers(supabase, parsed.customerQuery);
  const resolved = resolveCustomerMatch(matches, parsed.customerQuery);

  if (resolved.ambiguous) {
    const proposedAction = buildProposedAction({
      status: 'select_customer',
      confidence: 0.55,
      reason: `Multiple customers match '${parsed.customerQuery}'`,
      customerQuery: parsed.customerQuery,
      command: parsed.command,
      proposedLines: parsed.proposedLines,
      phrase: parsed.phrase,
      matches: resolved.matches,
    });
    return {
      reply: formatOrderAmbiguity(resolved.matches),
      source: ACTION_SOURCE,
      intent: 'order_workspace_disambiguation',
      proposedAction,
      matches: resolved.matches,
    };
  }

  if (!resolved.customer) {
    return {
      reply: formatUnknownCustomer(parsed.customerQuery),
      source: ACTION_SOURCE,
      intent: 'order_workspace_customer_not_found',
    };
  }

  const customerName = resolved.customer.business_name || resolved.customer.name || parsed.customerQuery;
  const meta = customerMatchMeta(resolved.customer, parsed.customerQuery);
  const proposedAction = buildProposedAction({
    status: 'proposed',
    confidence: meta.confidence,
    reason: meta.reason,
    customerQuery: parsed.customerQuery,
    command: parsed.command,
    customerId: resolved.customer.id,
    customerName,
    proposedLines: parsed.proposedLines,
    phrase: parsed.phrase,
  });

  return {
    reply: formatOrderCreateProposal({
      customerName,
      proposedLines: parsed.proposedLines,
      confidence: proposedAction.confidence,
    }),
    source: ACTION_SOURCE,
    intent: 'order_workspace_confirm',
    proposedAction,
  };
}

export async function resolveCustomerSelectionAction(ctx, proposedAction, query) {
  if (proposedAction.status !== 'select_customer' || !proposedAction.matches?.length) return null;
  if (isCancellationMessage(query)) {
    return {
      reply: formatActionCancelled(),
      source: ACTION_SOURCE,
      intent: 'order_workspace_cancelled',
      proposedAction: null,
    };
  }

  const selected = parseCustomerSelection(query, proposedAction.matches);
  if (!selected) {
    return {
      reply: `${formatOrderAmbiguity(proposedAction.matches)}\n\nReply with the customer number or exact name.`,
      source: ACTION_SOURCE,
      intent: 'order_workspace_disambiguation',
      proposedAction,
      matches: proposedAction.matches,
    };
  }

  const customerName = selected.business_name || selected.name || proposedAction.customerQuery;
  const meta = customerMatchMeta(selected, customerName);
  const nextProposed = buildProposedAction({
    ...proposedAction,
    status: 'proposed',
    confidence: meta.confidence,
    reason: meta.reason,
    customerId: selected.id,
    customerName,
    matches: undefined,
  });

  return {
    reply: formatOrderCreateProposal({
      customerName,
      proposedLines: proposedAction.proposedLines,
      confidence: nextProposed.confidence,
    }),
    source: ACTION_SOURCE,
    intent: 'order_workspace_confirm',
    proposedAction: nextProposed,
  };
}

export async function executeOrderWorkspaceCreate(ctx, proposedAction) {
  if (proposedAction.type !== 'order_workspace_create') {
    throw new Error('Unsupported proposed action type');
  }
  if (proposedAction.status === 'executed') {
    return {
      reply: formatDuplicateExecution(),
      source: ACTION_SOURCE,
      intent: 'order_workspace_already_created',
      proposedAction,
      workspace: proposedAction.workspaceId ? { id: proposedAction.workspaceId } : null,
    };
  }
  if (!proposedAction.customerId) {
    return {
      reply: formatMissingCustomerQuery(),
      source: ACTION_SOURCE,
      intent: 'order_workspace_missing_customer',
      proposedAction,
    };
  }

  const { supabase, actor } = ctx;
  const created = await createWorkspace(supabase, {
    actor,
    command: proposedAction.command,
    customerId: proposedAction.customerId,
    customerQuery: proposedAction.customerQuery,
  });

  if (created.ambiguous) {
    const nextProposed = buildProposedAction({
      ...proposedAction,
      status: 'select_customer',
      confidence: 0.55,
      reason: `Multiple customers match '${proposedAction.customerQuery}'`,
      matches: created.matches,
    });
    return {
      reply: formatOrderAmbiguity(created.matches),
      source: ACTION_SOURCE,
      intent: 'order_workspace_disambiguation',
      proposedAction: nextProposed,
      matches: created.matches,
    };
  }

  let row = created.row;
  for (const line of proposedAction.proposedLines || []) {
    const normalized = normalizeLine(line);
    if (!normalized.description && !normalized.sku) continue;
    row = await addWorkspaceLine(supabase, row.id, {
      actor,
      line: normalized,
    });
  }

  const executedProposed = buildProposedAction({
    ...proposedAction,
    status: 'executed',
    confidence: 1,
    reason: 'Action executed after confirmation',
    requiresConfirmation: false,
    workspaceId: row.id,
  });

  return {
    reply: formatOrderWorkspaceCreated(row),
    source: ACTION_SOURCE,
    intent: 'order_workspace_create',
    proposedAction: executedProposed,
    workspace: row,
  };
}

export async function tryOrderWorkspaceAction(ctx, query) {
  const parsed = detectOrderCreateIntent(query);
  if (!parsed) return null;
  return proposeOrderWorkspaceCreate(ctx, parsed);
}
