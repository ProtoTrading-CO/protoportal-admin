import {
  parseContainerEventPhrase,
  parseMemoryPhrase,
  parseOrderLineAddPhrase,
  parseSupplierEventPhrase,
} from './phrases.js';
import { customerLabel } from './customer.js';

/**
 * Infer handler intent from resolved context. Resolve → Infer → Confirm → Ask.
 */
export function inferActionContext(query, actionContext) {
  if (!actionContext) {
    return {
      intent: null,
      confidence: 0,
      needsClarification: true,
      clarificationQuestion: 'I need a little more context before I can help with that.',
      entities: {},
      reason: 'missing_context',
    };
  }

  const lineAdd = parseOrderLineAddPhrase(query);
  if (lineAdd) {
    return inferOrderLineAdd(lineAdd, actionContext);
  }

  const memory = parseMemoryPhrase(query);
  if (memory) {
    return inferMemoryCreate(memory, actionContext);
  }

  const supplierEvent = parseSupplierEventPhrase(query);
  if (supplierEvent) {
    return inferSupplierEvent(supplierEvent, actionContext);
  }

  const containerEvent = parseContainerEventPhrase(query);
  if (containerEvent) {
    return inferContainerEvent(containerEvent, actionContext);
  }

  return {
    intent: null,
    confidence: actionContext.confidence || 0,
    needsClarification: false,
    clarificationQuestion: null,
    entities: {},
    reason: 'no_inference',
  };
}

function inferOrderLineAdd(parsed, actionContext) {
  const workspace = actionContext.activeWorkspace;
  const customer = actionContext.activeCustomer;
  const hasWorkspace = Boolean(workspace?.id);
  const hasCustomer = Boolean(customer?.id || customer?.name);

  if (!hasWorkspace && !hasCustomer) {
    return {
      intent: 'order_line_add',
      confidence: 0.2,
      needsClarification: true,
      clarificationQuestion: 'Which order or customer should I add these to?',
      entities: { proposedLine: parsed },
      reason: 'missing_workspace_and_customer',
    };
  }

  return {
    intent: 'order_line_add',
    confidence: Math.max(actionContext.confidence || 0, hasWorkspace ? 0.9 : 0.75),
    needsClarification: false,
    clarificationQuestion: null,
    entities: {
      workspaceId: workspace?.id || actionContext.inherited?.workspaceId || null,
      customerId: customer?.id || actionContext.inherited?.customerId || null,
      customerName: customerLabel(customer) || actionContext.inherited?.customerName || null,
      supplier: actionContext.inherited?.supplier || null,
      dueDate: actionContext.inherited?.dueDate || null,
      proposedLine: parsed,
    },
    reason: hasWorkspace ? 'active_workspace_inherited' : 'customer_inherited',
    sources: actionContext.sources || [],
  };
}

function inferMemoryCreate(parsed, actionContext) {
  const customer = actionContext.activeCustomer;
  const hasCustomer = Boolean(customer?.id || customer?.name);

  if (!hasCustomer) {
    return {
      intent: 'memory_create',
      confidence: 0.25,
      needsClarification: true,
      clarificationQuestion: 'Which customer should I remember that for?',
      entities: { statement: parsed.statement },
      reason: 'missing_customer',
    };
  }

  return {
    intent: 'memory_create',
    confidence: Math.max(actionContext.confidence || 0, 0.9),
    needsClarification: false,
    clarificationQuestion: null,
    entities: {
      customerId: customer.id || null,
      customerName: customerLabel(customer),
      statement: parsed.statement,
      workspaceId: actionContext.activeWorkspace?.id || null,
    },
    reason: 'customer_inherited_from_workspace',
    sources: actionContext.sources || [],
  };
}

function inferSupplierEvent(parsed, actionContext) {
  const supplier = actionContext.activeSupplier;
  const hasSupplier = Boolean(supplier?.name || supplier?.entityId);

  if (!hasSupplier) {
    return {
      intent: 'supplier_event',
      confidence: 0.25,
      needsClarification: true,
      clarificationQuestion: 'Which supplier is running late?',
      entities: { phrase: parsed.phrase },
      reason: 'missing_supplier',
    };
  }

  return {
    intent: 'supplier_event',
    confidence: Math.max(actionContext.confidence || 0, 0.88),
    needsClarification: false,
    clarificationQuestion: null,
    entities: {
      supplierName: supplier.name || supplier.entityId,
      workspaceId: actionContext.activeWorkspace?.id || null,
      phrase: parsed.phrase,
    },
    reason: 'supplier_inherited_from_workspace',
    sources: actionContext.sources || [],
  };
}

function inferContainerEvent(parsed, actionContext) {
  const container = actionContext.activeContainer;
  const hasContainer = Boolean(container?.entityId || container?.reference);

  if (!hasContainer) {
    return {
      intent: 'container_event',
      confidence: 0.25,
      needsClarification: true,
      clarificationQuestion: 'Which container are you referring to?',
      entities: { phrase: parsed.phrase },
      reason: 'missing_container',
    };
  }

  return {
    intent: 'container_event',
    confidence: Math.max(actionContext.confidence || 0, 0.9),
    needsClarification: false,
    clarificationQuestion: null,
    entities: {
      containerId: container.entityId || container.reference,
      reference: container.reference || container.entityId,
      phrase: parsed.phrase,
    },
    reason: 'container_inherited_from_conversation',
    sources: actionContext.sources || [],
  };
}
