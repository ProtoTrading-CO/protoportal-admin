import { describe, it, expect } from 'vitest';
import { resolveIntent, resolutionToRoute } from '../../api/intelligence/intent-engine/resolve.js';
import { biRun, biFormat } from '../../api/intelligence/bi/facade.js';

describe('Capability 1.1A — intent-first routing', () => {
  it('routes best selling question to sales.context — not customer', () => {
    const q = 'Tell me about the best selling item today.';
    const r = resolveIntent(q);
    expect(r?.ok).toBe(true);
    expect(r.intentId).toBe('sales_analysis');
    expect(r.biIntent).toBe('sales.context');
    expect(r.entityType).toBeUndefined();
    expect(r.method).toBe('intent');
  });

  it('returns helpful capability-not-taught message for sales context', async () => {
    const route = resolutionToRoute(resolveIntent('Tell me about the best selling item today.'));
    expect(route.intent).toBe('sales.context');

    const env = await biRun(route.intent, route.params, {});
    expect(env.ok).toBe(true);
    expect(env.data.taught).toBe(false);
    expect(env.data.status.code).toBe('not_taught');

    const md = biFormat(route.intent, env);
    expect(md).toMatch(/Sales Intelligence/i);
    expect(md).toMatch(/don't yet have the knowledge/i);
    expect(md).toMatch(/Rather than guess/i);
    expect(md).toMatch(/has not graduated yet/i);
    expect(md).toMatch(/Capability 1\.3/);
    expect(md).toMatch(/Product lookups/i);
    expect(md).toMatch(/What sold best today/i);
    expect(md).not.toMatch(/No customer found/i);
  });

  it('routes Tell me about Addie to customer.context', () => {
    const r = resolveIntent('Tell me about Addie');
    expect(r?.intentId).toBe('customer_lookup');
    expect(r?.biIntent).toBe('customer.context');
    expect(r?.entityType).toBe('customer');
    expect(r?.params.q).toBe('Addie');
  });

  it('routes Tell me about Motarro to supplier.context', () => {
    const r = resolveIntent('Tell me about Motarro');
    expect(r?.intentId).toBe('supplier_lookup');
    expect(r?.biIntent).toBe('supplier.context');
    expect(r?.entityType).toBe('supplier');
    expect(r?.params.name).toBe('Motarro');
  });

  it('routes Tell me about SKU 8626100145 to product.context', () => {
    const r = resolveIntent('Tell me about SKU 8626100145');
    expect(r?.intentId).toBe('product_lookup');
    expect(r?.biIntent).toBe('product.context');
    expect(r?.entityType).toBe('product');
    expect(r?.params.code).toBe('8626100145');
  });

  it('routes Tell me about Playing Cards Animal to product.context (title)', () => {
    const r = resolveIntent('Tell me about Playing Cards Animal');
    expect(r?.intentId).toBe('product_lookup');
    expect(r?.biIntent).toBe('product.context');
    expect(r?.params.title).toBe('Playing Cards Animal');
  });

  it('preserves morning brief over entity parsing', () => {
    const r = resolveIntent('What needs my attention today?');
    expect(r?.intentId).toBe('daily_brief');
  });

  it('preserves explicit customer lookup', () => {
    const r = resolveIntent('Find customer Plushprops');
    expect(r?.intentId).toBe('customer_lookup');
    expect(r?.params.q).toBe('Plushprops');
  });
});
