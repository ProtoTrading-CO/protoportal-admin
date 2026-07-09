import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSkuProductQuery, tryProductContextRoute } from '../../api/apollo-product-route.js';
import { executeIntent } from '../../api/apollo-engine.js';
import { validateIntent } from '../../api/apollo-validate.js';
import { parseIntentHint } from '../../api/apollo-intent.js';

describe('apollo chat — SKU product routing', () => {
  it('detects SKU-shaped queries', () => {
    expect(isSkuProductQuery('8626100145')).toBe(true);
    expect(isSkuProductQuery('Tell me about SKU 8626100145')).toBe(true);
    expect(isSkuProductQuery('Tell me about SKU 8626100145.')).toBe(true);
    expect(isSkuProductQuery('Show product 8610100001')).toBe(true);
    expect(isSkuProductQuery('best selling today')).toBe(false);
  });

  it('parseIntentHint forces product context for bare SKU', () => {
    const hint = parseIntentHint('8626100145');
    expect(hint.intent).toBe('product_lookup');
    expect(hint.confidence).toBe(1);
    expect(hint.forceProductContext).toBe(true);
  });

  it('validateIntent rejects product_search for SKU terms', () => {
    expect(validateIntent('8626100145', { intent: 'product_search', terms: '8626100145' })).toBe(false);
  });

  it('product_search engine returns null for SKU terms (no keyword index)', () => {
    const result = executeIntent('product_search', { index: [] }, '8626100145', { terms: '8626100145' });
    expect(result).toBeNull();
  });

  beforeEach(() => {
    vi.resetModules();
  });

  it('tryProductContextRoute returns Product Context markdown — not keyword miss', async () => {
    vi.doMock('../../api/intelligence/bi/facade.js', () => ({
      biRun: vi.fn(async () => ({
        ok: true,
        data: {
          code: '8626100145',
          liveErp: true,
          erpDataSource: 'erp_sql',
          erp: { title: 'PLAYING CARDS ANIMAL', onhand: 42, booked: 0, available: 42, dept: 'ART' },
          website: null,
          stock: { onHand: 42, source: 'erp_sql' },
          supplier: { name: 'YIWU', department: 'ART' },
          status: { code: 'erp_only', label: 'In ERP — not on website' },
          evidence: {
            title: { value: 'PLAYING CARDS ANIMAL', source: 'erp_sql', timestamp: '2026-07-09T12:00:00.000Z', confidence: 0.98 },
          },
          notAvailable: [],
        },
        meta: { source: ['erp_sql'], generatedAt: '2026-07-09T12:00:00.000Z', warnings: [] },
      })),
      biFormat: vi.fn((intent, envelope) => `## Product ${envelope.data.code}\n\n### ${envelope.data.erp.title}\n\n_live BLADERUNNER_`),
    }));

    const { tryProductContextRoute: tryRoute } = await import('../../api/apollo-product-route.js');
    const result = await tryRoute('8626100145', 'teacher@test.com');
    expect(result?.source).toBe('product.context');
    expect(result?.intent).toBe('product.context');
    expect(result?.reply).toMatch(/PLAYING CARDS ANIMAL/);
    expect(result?.reply).not.toMatch(/No products matched/i);
  });
});
