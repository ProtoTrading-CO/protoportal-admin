import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  beforeEach(() => {
    vi.resetModules();
  });

  it('returns portal top sellers for best selling question', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async () => ({
        ok: true,
        data: {
          period: 'today',
          periodLabel: 'today (SAST)',
          scope: 'top_sellers',
          orderCount: 3,
          items: [{ code: '8610100001', name: 'Test Widget', totalQty: 12, orderCount: 2 }],
        },
        meta: { source: ['portal_supabase'], generatedAt: '2026-07-09T12:00:00.000Z', partial: false },
      })),
    }));

    const { biRun: run, biFormat: format } = await import('../../api/intelligence/bi/facade.js');
    const route = resolutionToRoute(resolveIntent('What was the best seller today?'));
    expect(route.intent).toBe('sales.context');
    expect(route.params.period).toBe('today');

    const env = await run(route.intent, route.params, {});
    expect(env.ok).toBe(true);
    expect(env.data.taught).toBe(true);
    expect(env.data.dataSource).toBe('portal_orders');

    const md = format(route.intent, env);
    expect(md).toMatch(/Sales intelligence/i);
    expect(md).toMatch(/portal orders/i);
    expect(md).toMatch(/Test Widget/);
    expect(md).not.toMatch(/has not graduated yet/i);
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
