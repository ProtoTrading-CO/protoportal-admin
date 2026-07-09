import { describe, it, expect } from 'vitest';
import {
  resolveEntity,
  entityResolutionToRoute,
  ENTITY_REGISTRY,
  detectProductEntity,
  detectSupplierEntity,
  detectContainerEntity,
  detectCustomerEntity,
} from '../../api/intelligence/entity-registry/index.js';
import { buildSupplierContext } from '../../api/intelligence/bi/contexts/supplier.js';
import { buildContainerContext } from '../../api/intelligence/bi/contexts/container.js';
import { formatSupplierContext } from '../../api/intelligence/bi/format/supplier.js';

describe('entity registry', () => {
  it('defines core entity types', () => {
    expect(Object.keys(ENTITY_REGISTRY).sort()).toEqual([
      'container',
      'customer',
      'product',
      'supplier',
    ]);
  });
});

describe('resolveEntity — product', () => {
  it('resolves bare SKU to product context', () => {
    const r = resolveEntity('8614001234');
    expect(r?.ok).toBe(true);
    expect(r.entityType).toBe('product');
    expect(r.entityId).toBe('8614001234');
    expect(r.intentId).toBe('product_lookup');
    expect(r.biIntent).toBe('product.context');
    expect(r.params.code).toBe('8614001234');
  });

  it('resolves explicit product phrasing', () => {
    const r = resolveEntity('Show product 8610100001');
    expect(r?.entityType).toBe('product');
    expect(r.params.code).toBe('8610100001');
  });
});

describe('resolveEntity — customer', () => {
  it('resolves customer name queries', () => {
    const r = resolveEntity('Find customer Plushprops');
    expect(r?.entityType).toBe('customer');
    expect(r.intentId).toBe('customer_lookup');
    expect(r.params.q).toBe('Plushprops');
  });

  it('resolves bare customer name Addie', () => {
    const r = resolveEntity('Addie');
    expect(r?.entityType).toBe('customer');
    expect(r.params.q).toBe('Addie');
  });

  it('resolves tell me about business name', () => {
    const r = resolveEntity('Tell me about ABC Stationers');
    expect(r?.entityType).toBe('customer');
    expect(r.params.q).toBe('ABC Stationers');
  });
});

describe('resolveEntity — supplier', () => {
  it('resolves bare Motarro to supplier stub context', () => {
    const r = resolveEntity('Motarro');
    expect(r?.ok).toBe(true);
    expect(r.entityType).toBe('supplier');
    expect(r.intentId).toBe('supplier_lookup');
    expect(r.biIntent).toBe('supplier.context');
    expect(r.params.name).toBe('Motarro');
  });

  it('resolves explicit supplier phrasing', () => {
    const r = resolveEntity('Supplier Motarro');
    expect(r?.entityType).toBe('supplier');
    expect(r.params.name).toBe('Motarro');
  });
});

describe('resolveEntity — container', () => {
  it('resolves Container 57', () => {
    const r = resolveEntity('Container 57');
    expect(r?.entityType).toBe('container');
    expect(r.intentId).toBe('container_lookup');
    expect(r.params.number).toBe('57');
    expect(r.params.reference).toBe('Container 57');
  });
});

describe('resolveEntity — clarify', () => {
  it('does not clarify at entity layer — intent engine handles ambiguity', () => {
    expect(resolveEntity('Leather')).toBeNull();
  });
});

describe('entityResolutionToRoute', () => {
  it('maps product entity to facade route', () => {
    const route = entityResolutionToRoute(resolveEntity('8614001234'));
    expect(route.intent).toBe('product.context');
    expect(route.entityType).toBe('product');
    expect(route.entityId).toBe('8614001234');
  });
});

describe('supplier context stub', () => {
  it('returns stub envelope with notAvailable fields', async () => {
    const env = await buildSupplierContext({ name: 'Motarro' });
    expect(env.ok).toBe(true);
    expect(env.data.name).toBe('Motarro');
    expect(env.data.stub).toBe(true);
    expect(env.data.notAvailable).toContain('lead_times');
  });

  it('formats supplier stub markdown', async () => {
    const env = await buildSupplierContext({ name: 'Motarro' });
    const md = formatSupplierContext(env);
    expect(md).toContain('Motarro');
    expect(md).toContain('stub');
  });
});

describe('container context stub', () => {
  it('returns stub envelope for container reference', async () => {
    const env = await buildContainerContext({ reference: 'Container 57', number: '57' });
    expect(env.ok).toBe(true);
    expect(env.data.reference).toBe('Container 57');
    expect(env.data.stub).toBe(true);
  });
});

describe('detector priority', () => {
  it('SKU wins over other detectors', () => {
    expect(detectProductEntity('8614001234')?.entityType).toBe('product');
  });

  it('container detected before supplier/customer', () => {
    expect(detectContainerEntity('Container 12')?.entityType).toBe('container');
  });

  it('short customer name not classified as supplier', () => {
    expect(detectCustomerEntity('Addie')?.entityType).toBe('customer');
    expect(detectSupplierEntity('Addie')).toBeNull();
  });
});
