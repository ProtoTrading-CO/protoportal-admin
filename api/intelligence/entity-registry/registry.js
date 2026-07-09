/**
 * Apollo Entity Registry — maps business entity types to Business Contexts.
 * Apollo requests Contexts; Contexts gather Truth via Query Engine.
 */

/** @typedef {'product'|'customer'|'supplier'|'container'|'order'|'website'|'memory'|'knowledge'} EntityType */

/**
 * @typedef {object} EntityDefinition
 * @property {EntityType} type
 * @property {string} intentId
 * @property {string} biIntent — facade handler key
 * @property {string} label
 */

/** @type {Record<string, EntityDefinition>} */
export const ENTITY_REGISTRY = {
  product: {
    type: 'product',
    intentId: 'product_lookup',
    biIntent: 'product.context',
    label: 'Product',
  },
  customer: {
    type: 'customer',
    intentId: 'customer_lookup',
    biIntent: 'customer.context',
    label: 'Customer',
  },
  supplier: {
    type: 'supplier',
    intentId: 'supplier_lookup',
    biIntent: 'supplier.context',
    label: 'Supplier',
  },
  container: {
    type: 'container',
    intentId: 'container_lookup',
    biIntent: 'container.context',
    label: 'Container',
  },
};

export const ENTITY_TYPES = Object.keys(ENTITY_REGISTRY);

export function getEntityDefinition(entityType) {
  return ENTITY_REGISTRY[entityType] || null;
}

export function entityToIntent(entityType) {
  const def = getEntityDefinition(entityType);
  if (!def) return null;
  return { intentId: def.intentId, biIntent: def.biIntent, entityType: def.type };
}
