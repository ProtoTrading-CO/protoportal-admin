import { resolveCustomerMatch } from '../../../_order-workspace-core.js';
import { findCustomers } from '../../../order-workspaces.js';

export function customerLabel(customer) {
  if (!customer) return '';
  return customer.business_name || customer.name || customer.customer_name || '';
}

export function customerMatchesQuery(customer, customerQuery) {
  const q = String(customerQuery || '').trim().toLowerCase();
  if (!q || !customer) return false;
  const fields = [
    customer.business_name,
    customer.name,
    customer.contact_name,
    customer.email,
    customer.customer_code,
    customer.customer_name,
  ]
    .filter(Boolean)
    .map((v) => String(v).trim().toLowerCase());
  if (fields.some((v) => v === q)) return true;
  if (q.length >= 3 && fields.some((v) => v.includes(q) || q.includes(v))) return true;
  return false;
}

export function workspaceCustomerToRecord(workspaceCustomer) {
  if (!workspaceCustomer) return null;
  return {
    id: workspaceCustomer.customer_id || workspaceCustomer.id || null,
    name: workspaceCustomer.customer_name || workspaceCustomer.name || null,
    business_name: workspaceCustomer.business_name || workspaceCustomer.customer_name || null,
    contact_name: workspaceCustomer.contact_name || null,
    email: workspaceCustomer.email || null,
    phone: workspaceCustomer.phone || null,
    customer_code: workspaceCustomer.customer_code || null,
    customer_name: workspaceCustomer.customer_name || null,
  };
}

/**
 * Resolve a customer query to a record. Used only by Context Resolver.
 */
export async function resolveCustomerQuery(supabase, customerQuery) {
  const matches = await findCustomers(supabase, customerQuery);
  const resolved = resolveCustomerMatch(matches, customerQuery);
  return {
    customer: resolved.customer || null,
    ambiguous: Boolean(resolved.ambiguous),
    matches: resolved.matches || matches,
  };
}

/**
 * Read customer resolution prepared by Context Resolver — handlers must use this.
 */
export function getCustomerForAction(ctx, customerQuery) {
  const actionContext = ctx?.actionContext;
  if (!actionContext) {
    return { customer: null, ambiguous: false, matches: [] };
  }

  if (customerQuery && actionContext.customerResolution) {
    const resolution = actionContext.customerResolution;
    if (resolution.customerQuery?.toLowerCase() === String(customerQuery).trim().toLowerCase()) {
      return {
        customer: resolution.customer,
        ambiguous: resolution.ambiguous,
        matches: resolution.matches || [],
      };
    }
  }

  if (customerQuery && actionContext.activeCustomer?.id) {
    if (customerMatchesQuery(actionContext.activeCustomer, customerQuery)) {
      return {
        customer: actionContext.activeCustomer,
        ambiguous: false,
        matches: [actionContext.activeCustomer],
      };
    }
  }

  if (actionContext.activeCustomer?.id) {
    return {
      customer: actionContext.activeCustomer,
      ambiguous: false,
      matches: [actionContext.activeCustomer],
    };
  }

  return actionContext.customerResolution || { customer: null, ambiguous: false, matches: [] };
}
