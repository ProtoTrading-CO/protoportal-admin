import { resolveEntity } from '../../entity-registry/resolve.js';
import { classifyActionIntent, parseOrderCreatePhrase } from './phrases.js';
import { buildContextConfidence } from './confidence.js';
import {
  customerLabel,
  resolveCustomerQuery,
  workspaceCustomerToRecord,
} from './customer.js';
import {
  buildInheritedWorkspaceData,
  resolveActiveWorkspace,
} from './workspace.js';

function buildRecentConversation(conversationContext = {}) {
  const proposedAction = conversationContext.proposedAction || null;
  const previousEntity = conversationContext.previousEntity || null;
  const previousWorkspaceId = conversationContext.previousWorkspaceId || null;
  const messages = Array.isArray(conversationContext.messages) ? conversationContext.messages : [];

  return {
    proposedAction,
    previousEntity,
    previousWorkspaceId,
    activeWorkspaceId: conversationContext.activeWorkspaceId || null,
    activeContainer: conversationContext.activeContainer || null,
    lastIntent: conversationContext.lastIntent || null,
    recentMessages: messages.slice(-6),
  };
}

function supplierFromWorkspace(workspace) {
  const supplier = String(workspace?.supplier || '').trim();
  if (!supplier) return null;
  return {
    name: supplier,
    entityType: 'supplier',
    entityId: supplier,
    statusContext: workspace.status,
    source: 'workspace_data',
  };
}

function containerFromConversation(conversationContext) {
  const container = conversationContext?.activeContainer;
  if (!container) return null;
  return {
    entityType: 'container',
    entityId: container.entityId || container.reference || container.id,
    reference: container.reference || container.entityId,
    number: container.number || null,
    source: 'conversation',
  };
}

/**
 * Shared Context Resolver — single source of conversational context for all handlers.
 */
export async function resolveActionContext({
  query,
  supabase,
  actor,
  conversationContext = null,
  intentHint = null,
}) {
  const sources = [];
  const intent = intentHint || classifyActionIntent(query);
  const recentConversation = buildRecentConversation(conversationContext || {});

  let activeWorkspace = null;
  let activeCustomer = null;
  let activeSupplier = null;
  let activeContainer = null;
  let activeProduct = null;
  let customerResolution = null;

  if (recentConversation.proposedAction?.customerId) {
    activeCustomer = {
      id: recentConversation.proposedAction.customerId,
      name: recentConversation.proposedAction.customerName,
      business_name: recentConversation.proposedAction.customerName,
      source: 'conversation',
    };
    sources.push('conversation');
  }

  if (recentConversation.previousEntity?.entityType === 'customer') {
    activeCustomer = activeCustomer || {
      id: recentConversation.previousEntity.entityId,
      name: recentConversation.previousEntity.label || recentConversation.previousEntity.entityId,
      source: 'conversation',
    };
    sources.push('conversation');
  }

  const workspaceResult = await resolveActiveWorkspace(supabase, recentConversation);
  if (workspaceResult.workspace) {
    activeWorkspace = workspaceResult.workspace;
    sources.push(workspaceResult.source || 'workspace');

    const wsCustomer = workspaceCustomerToRecord(activeWorkspace.customer);
    if (wsCustomer?.id || wsCustomer?.name) {
      activeCustomer = activeCustomer || { ...wsCustomer, source: 'workspace' };
      if (!sources.includes('workspace')) sources.push('workspace');
    }

    const wsSupplier = supplierFromWorkspace(activeWorkspace);
    if (wsSupplier) {
      activeSupplier = activeSupplier || wsSupplier;
      sources.push('workspace_data');
    }
  }

  const entityResolved = resolveEntity(query);
  if (entityResolved?.ok) {
    sources.push('entity_registry');
    if (entityResolved.entityType === 'customer') {
      const resolvedCustomer = await resolveCustomerQuery(supabase, entityResolved.params?.q || entityResolved.entityId);
      customerResolution = {
        customerQuery: entityResolved.params?.q || entityResolved.entityId,
        ...resolvedCustomer,
      };
      if (resolvedCustomer.customer) {
        activeCustomer = { ...resolvedCustomer.customer, source: 'entity_registry' };
      }
    } else if (entityResolved.entityType === 'supplier') {
      activeSupplier = {
        name: entityResolved.params?.name || entityResolved.entityId,
        entityType: 'supplier',
        entityId: entityResolved.entityId,
        source: 'entity_registry',
      };
    } else if (entityResolved.entityType === 'container') {
      activeContainer = {
        entityType: 'container',
        entityId: entityResolved.entityId,
        reference: entityResolved.params?.reference || entityResolved.entityId,
        number: entityResolved.params?.number || null,
        source: 'entity_registry',
      };
    } else if (entityResolved.entityType === 'product') {
      activeProduct = {
        entityType: 'product',
        entityId: entityResolved.entityId,
        code: entityResolved.params?.code || entityResolved.entityId,
        source: 'entity_registry',
      };
    }
  }

  const orderCreate = parseOrderCreatePhrase(query);
  if (orderCreate?.customerQuery) {
    customerResolution = await resolveCustomerQuery(supabase, orderCreate.customerQuery);
    customerResolution.customerQuery = orderCreate.customerQuery;
    sources.push('entity_registry');
    if (customerResolution.customer) {
      activeCustomer = { ...customerResolution.customer, source: 'entity_registry' };
    }
  }

  activeContainer = activeContainer || containerFromConversation(conversationContext || {});
  if (activeContainer && !sources.includes('conversation')) {
    sources.push('conversation');
  }

  if (!activeSupplier && recentConversation.previousEntity?.entityType === 'supplier') {
    activeSupplier = {
      name: recentConversation.previousEntity.entityId,
      entityType: 'supplier',
      entityId: recentConversation.previousEntity.entityId,
      source: 'conversation',
    };
    sources.push('conversation');
  }

  const inherited = {
    ...buildInheritedWorkspaceData(activeWorkspace),
    customerId: activeCustomer?.id || activeWorkspace?.customer_id || null,
    customerName: customerLabel(activeCustomer) || null,
    supplier: activeSupplier?.name || activeWorkspace?.supplier || null,
    dueDate: activeWorkspace?.due_date || null,
  };

  const { confidence, sources: rankedSources } = buildContextConfidence(sources, {
    hasWorkspace: Boolean(activeWorkspace),
    hasCustomer: Boolean(activeCustomer?.id || activeCustomer?.name),
    hasSupplier: Boolean(activeSupplier?.name),
    hasContainer: Boolean(activeContainer?.entityId),
  });

  return {
    activeWorkspace: activeWorkspace || {},
    activeCustomer: activeCustomer || {},
    activeSupplier: activeSupplier || {},
    activeContainer: activeContainer || {},
    activeProduct: activeProduct || {},
    recentConversation,
    inherited,
    customerResolution,
    intent,
    actor: actor || 'apollo',
    confidence,
    sources: rankedSources,
  };
}
