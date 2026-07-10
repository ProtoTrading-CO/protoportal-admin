import { isCancellationMessage, isConfirmationMessage } from './confirmation.js';
import { formatActionCancelled } from './format.js';
import {
  executeOrderWorkspaceCreate,
  resolveCustomerSelectionAction,
  tryOrderWorkspaceAction,
} from './handlers/orders.js';

const ACTION_HANDLERS = [
  tryOrderWorkspaceAction,
];

/**
 * Apollo Action Engine — resolve any supported input into a proposed action.
 */
export async function resolveActionInput(query, ctx) {
  for (const handler of ACTION_HANDLERS) {
    const result = await handler(ctx, query);
    if (result) return result;
  }
  return null;
}

/**
 * Continue or execute a proposed action from a prior proposal.
 */
export async function continueProposedAction(ctx, { proposedAction, query, confirmAction = false }) {
  if (!proposedAction) return null;

  if (isCancellationMessage(query)) {
    return {
      reply: formatActionCancelled(),
      source: 'apollo-action',
      intent: 'order_workspace_cancelled',
      proposedAction: null,
    };
  }

  if (proposedAction.status === 'select_customer') {
    return resolveCustomerSelectionAction(ctx, proposedAction, query);
  }

  if (proposedAction.status === 'proposed' && isConfirmationMessage(query, { confirmAction })) {
    return executeOrderWorkspaceCreate(ctx, proposedAction);
  }

  if (proposedAction.status === 'executed') {
    return executeOrderWorkspaceCreate(ctx, proposedAction);
  }

  return {
    reply: 'Reply **confirm** to create the draft Order Workspace, or **cancel** to stop.',
    source: 'apollo-action',
    intent: 'order_workspace_confirm',
    proposedAction,
  };
}

/**
 * Single Apollo action entry point for POST /api/apollo.
 */
export async function handleApolloAction({
  query,
  proposedAction = null,
  confirmAction = false,
  supabase,
  actor,
}) {
  const ctx = { supabase, actor: actor || 'apollo' };
  const newAction = await resolveActionInput(query, ctx);
  if (newAction) return newAction;

  if (proposedAction) {
    return continueProposedAction(ctx, { proposedAction, query, confirmAction });
  }

  return null;
}

export {
  buildProposedAction,
  detectOrderCreateIntent,
  executeOrderWorkspaceCreate,
  proposeOrderWorkspaceCreate,
} from './handlers/orders.js';

export { parseOrderCreatePhrase } from '../abl/order-create.js';
export { isConfirmationMessage } from './confirmation.js';
