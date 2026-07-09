import { describe, it, expect } from 'vitest';
import { resolveIntent, resolutionToRoute } from '../../api/intelligence/intent-engine/resolve.js';
import { INTENT_REGISTRY } from '../../api/intelligence/intent-engine/registry.js';

describe('intent registry', () => {
  it('defines core business intents including entity lookups', () => {
    expect(Object.keys(INTENT_REGISTRY).sort()).toEqual([
      'business_health',
      'container_lookup',
      'customer_lookup',
      'daily_brief',
      'inventory_attention',
      'product_lookup',
      'sales_analysis',
      'supplier_lookup',
      'website_summary',
      'yesterday_summary',
    ]);
  });
});

describe('resolveIntent — daily_brief', () => {
  const cases = [
    'What needs my attention?',
    'What needs my attention today?',
    'Morning briefing',
    'What should I focus on?',
    "What's important today?",
    "Give me today's briefing",
    'Focus today',
  ];

  for (const q of cases) {
    it(`resolves "${q}" to daily_brief`, () => {
      const r = resolveIntent(q);
      expect(r?.ok).toBe(true);
      expect(r.intentId).toBe('daily_brief');
      expect(r.biIntent).toBe('brief.morning');
      expect(r.method).toBe('exact');
    });
  }

  it('does not keyword-match unrelated questions', () => {
    expect(resolveIntent('orders this week')).toBeNull();
  });
});

describe('resolveIntent — product_lookup', () => {
  it('resolves SKU lookups', () => {
    const r = resolveIntent('Show product 8610100001');
    expect(r?.ok).toBe(true);
    expect(r.intentId).toBe('product_lookup');
    expect(r.params.code).toBe('8610100001');
    expect(r.biIntent).toBe('product.context');
  });

  it('resolves bare SKU', () => {
    const r = resolveIntent('8610100001');
    expect(r?.intentId).toBe('product_lookup');
  });
});

describe('resolveIntent — customer_lookup', () => {
  it('resolves named customer queries', () => {
    const r = resolveIntent('Find customer Plushprops');
    expect(r?.intentId).toBe('customer_lookup');
    expect(r.params.q).toBe('Plushprops');
  });

  it('resolves tell me about business', () => {
    const r = resolveIntent('Tell me about ABC Stationers');
    expect(r?.intentId).toBe('customer_lookup');
    expect(r.params.q).toBe('ABC Stationers');
    expect(r.entityType).toBe('customer');
  });

  it('resolves bare SKU with entity metadata', () => {
    const r = resolveIntent('8614001234');
    expect(r?.entityType).toBe('product');
    expect(r?.entityId).toBe('8614001234');
  });

  it('resolves supplier Motarro', () => {
    const r = resolveIntent('Motarro');
    expect(r?.intentId).toBe('supplier_lookup');
    expect(r?.biIntent).toBe('supplier.context');
    expect(r?.entityType).toBe('supplier');
  });

  it('resolves Container 57', () => {
    const r = resolveIntent('Container 57');
    expect(r?.intentId).toBe('container_lookup');
    expect(r?.params.number).toBe('57');
  });
});

describe('resolveIntent — inventory_attention', () => {
  it('routes stock problem phrases', () => {
    expect(resolveIntent('Negative stock')?.intentId).toBe('inventory_attention');
    expect(resolveIntent('Low stock')?.params.type).toBe('low');
    expect(resolveIntent('Inventory issues')?.intentId).toBe('inventory_attention');
    expect(resolveIntent('Which products have negative stock?')?.params.type).toBe('negative');
  });
});

describe('resolveIntent — section intents', () => {
  it('routes business health', () => {
    const r = resolveIntent('How is the business doing?');
    expect(r?.intentId).toBe('business_health');
    expect(r.formatSection).toBe('business_health');
  });

  it('routes yesterday summary separately from daily brief', () => {
    const r = resolveIntent('What changed yesterday?');
    expect(r?.intentId).toBe('yesterday_summary');
    expect(r.formatSection).toBe('yesterday');
  });

  it('routes website summary', () => {
    const r = resolveIntent('Website changes');
    expect(r?.intentId).toBe('website_summary');
    expect(r.formatSection).toBe('website');
  });
});

describe('resolveIntent — clarify', () => {
  it('asks when a term is ambiguous', () => {
    const r = resolveIntent('Leather');
    expect(r?.ok).toBe(false);
    expect(r.reason).toBe('clarify');
    expect(r.reply).toMatch(/product line|department|supplier/i);
  });
});

describe('resolutionToRoute', () => {
  it('maps to BI facade keys', () => {
    const r = resolveIntent('Morning brief');
    const route = resolutionToRoute(r);
    expect(route.intent).toBe('brief.morning');
    expect(route.businessIntent).toBe('daily_brief');
  });
});
