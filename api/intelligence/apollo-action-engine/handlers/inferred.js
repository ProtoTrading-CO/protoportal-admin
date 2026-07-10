import { randomUUID } from 'node:crypto';
import { buildProposedAction } from './orders.js';

const ACTION_SOURCE = 'apollo-action';

function formatOrderLineAddProposal({ customerName, workspaceId, line, supplier, dueDate, confidence }) {
  const parts = [
    `I can add **${line.requestedQty} ${line.description}**`,
    customerName ? `to **${customerName}**'s active order` : 'to the active order',
    workspaceId ? `(workspace \`${workspaceId}\`)` : null,
    supplier ? `supplier **${supplier}**` : null,
    dueDate ? `due **${dueDate}**` : null,
    `— confidence **${Math.round(confidence * 100)}%**`,
    '\n\nReply **confirm** when Orders Phase 2 execution is enabled, or adjust the line first.',
  ].filter(Boolean);
  return parts.join(' ');
}

/**
 * Resolve → Infer → Confirm → Ask — clarification and inferred previews only (no execution).
 */
export async function tryInferredAction(ctx, query) {
  const inference = ctx.inference;
  if (!inference?.intent) return null;

  if (inference.needsClarification) {
    return {
      reply: inference.clarificationQuestion,
      source: ACTION_SOURCE,
      intent: 'context_clarification',
      actionContext: ctx.actionContext,
      inference,
    };
  }

  if (inference.intent === 'order_line_add') {
    const { entities } = inference;
    const proposedAction = buildProposedAction({
      type: 'order_line_add',
      status: 'proposed',
      confidence: inference.confidence,
      reason: inference.reason,
      customerId: entities.customerId,
      customerName: entities.customerName,
      workspaceId: entities.workspaceId,
      proposedLines: [entities.proposedLine],
      phrase: entities.proposedLine?.phrase || 'order_line_add',
      command: query,
    });

    return {
      reply: formatOrderLineAddProposal({
        customerName: entities.customerName,
        workspaceId: entities.workspaceId,
        line: entities.proposedLine,
        supplier: entities.supplier,
        dueDate: entities.dueDate,
        confidence: inference.confidence,
      }),
      source: ACTION_SOURCE,
      intent: 'order_line_add_proposed',
      proposedAction,
      actionContext: ctx.actionContext,
      inference,
    };
  }

  if (inference.intent === 'memory_create') {
    return {
      reply: `I'll remember that for **${inference.entities.customerName}** once Memory Handler v1 is enabled.`,
      source: ACTION_SOURCE,
      intent: 'memory_create_preview',
      actionContext: ctx.actionContext,
      inference,
    };
  }

  if (inference.intent === 'supplier_event') {
    return {
      reply: `Noted — **${inference.entities.supplierName}** is running late on the active workspace.`,
      source: ACTION_SOURCE,
      intent: 'supplier_event_preview',
      actionContext: ctx.actionContext,
      inference,
    };
  }

  if (inference.intent === 'container_event') {
    return {
      reply: `Noted — **${inference.entities.reference}** arrived today.`,
      source: ACTION_SOURCE,
      intent: 'container_event_preview',
      actionContext: ctx.actionContext,
      inference,
    };
  }

  return null;
}
