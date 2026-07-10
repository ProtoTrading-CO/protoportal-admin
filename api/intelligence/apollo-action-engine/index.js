import { isCancellationMessage, isConfirmationMessage } from './confirmation.js';
import { formatActionCancelled } from './format.js';
import {
  executeOrderWorkspaceCreate,
  resolveCustomerSelectionAction,
  tryOrderWorkspaceAction,
} from './handlers/orders.js';
import { tryInferredAction } from './handlers/inferred.js';
import {
  classifyActionIntent,
  inferActionContext,
  resolveActionContext,
} from './context/index.js';

const ACTION_HANDLERS = [
  tryOrderWorkspaceAction,
  tryInferredAction,
];

/**
 * Apollo Action Engine — resolve any supported input into a proposed action.
 * Handlers receive ctx.actionContext from Context Resolver; no direct lookups.
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
 * Pipeline: Input → Intent → Context Resolver → Handler → Proposed Action → …
 */
export async function handleApolloAction({
  query,
  proposedAction = null,
  confirmAction = false,
  supabase,
  actor,
  conversationContext = null,
}) {
  const mergedConversation = {
    ...(conversationContext || {}),
    proposedAction: conversationContext?.proposedAction ?? proposedAction,
  };

  const intentHint = classifyActionIntent(query);
  const actionContext = await resolveActionContext({
    query,
    supabase,
    actor: actor || 'apollo',
    conversationContext: mergedConversation,
    intentHint,
  });
  const inference = inferActionContext(query, actionContext);
  const ctx = {
    supabase,
    actor: actor || 'apollo',
    actionContext,
    inference,
  };

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
export { resolveActionContext, inferActionContext } from './context/index.js';
