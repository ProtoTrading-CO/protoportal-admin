import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isSkuProductQuery, tryProductContextRoute } from '../../api/apollo-product-route.js';
import { looksLikeProductTitleSubject } from '../../api/intelligence/intent-engine/classify.js';
import { executeIntent } from '../../api/apollo-engine.js';
import { validateIntent } from '../../api/apollo-validate.js';
import { isPortalOverviewQuery, parseIntentHint } from '../../api/apollo-intent.js';
import { createRoutingTrace } from '../../api/apollo.js';

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

describe('apollo chat — portal overview', () => {
  const stubData = {
    customers: { total: 42, pending: 3, list: [{ name: 'Derek', business: 'THE LITTLE NEST', joined: '2026-07-09', approved: true, orderCount: 0 }] },
    orders: { total: 120, last30Count: 15, statusBreakdown: {}, recent: [] },
    products: {
      liveCount: 5374,
      archivedCount: 527,
      stockLinkedCount: 5000,
      negativeStock: [
        { sku: 'GEL-JBM', title: 'GELO JELLY BEARS', stockOnHand: -1033 },
        { sku: 'GEL-BLA', title: 'GELO SOFT SWEETS BLACKBERRY', stockOnHand: -1033 },
      ],
      byCategory: [],
    },
    search: {
      topSearches: [{ normalized_search_term: 'scarf', searches: 27 }],
      zeroResultTerms: [],
      searchesToOrders: [{ normalized_search_term: 'motarro', searches: 3, orders: 0, conversion: 0 }],
    },
  };

  const overviewPrompts = [
    'Give me a quick overview',
    'overview',
    'system status',
    'dashboard',
    'admin overview',
    'system overview',
    'system health',
    "what's happening today",
  ];

  it.each(overviewPrompts)('routes "%s" to portal_overview', (query) => {
    expect(isPortalOverviewQuery(query)).toBe(true);
    expect(parseIntentHint(query).intent).toBe('portal_overview');
  });

  it('portal_overview uses admin framing not public website copy', () => {
    const result = executeIntent('portal_overview', stubData);
    expect(result.reply).toMatch(/admin snapshot/i);
    expect(result.reply).not.toMatch(/This website is for/i);
    expect(result.reply).toMatch(/website catalogue/i);
    expect(result.reply).toMatch(/Positill ERP/i);
    expect(result.reply).toMatch(/share the same website stock level/i);
  });

  it.each(overviewPrompts)('does not treat "%s" as a product title', (query) => {
    expect(looksLikeProductTitleSubject(query)).toBe(false);
  });

  it.each(overviewPrompts)('keeps "%s" out of Product Context', async (query) => {
    const result = await tryProductContextRoute(query, 'teacher@test.com');
    expect(result).toBeNull();
  });

  it('does not use Product Context as an unknown-query fallback', async () => {
    const result = await tryProductContextRoute('What should I focus on next?', 'teacher@test.com');
    expect(result).toBeNull();
  });

  it('emits a structured routing trace without returning it to the user', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const now = vi.fn()
      .mockReturnValueOnce(100)
      .mockReturnValueOnce(102)
      .mockReturnValueOnce(105);
    const trace = createRoutingTrace('Give me a quick overview', {
      traceId: '9b2f6e5c-1234-4567-89ab-1234567890ab',
      startedAt: '2026-07-10T09:44:00.000Z',
      now,
    });
    trace.addDecision({
      context: 'Product Context',
      outcome: 'declined',
      reason: 'no product entity',
      confidence: 0.04,
    });
    trace.addDecision({
      context: 'Overview Context',
      outcome: 'accepted',
      reason: 'portal_overview intent',
      confidence: 0.99,
      startedAt: 100,
    });
    trace.finish('portal_overview');

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0][0]).toBe('[apollo-routing]');
    const payload = JSON.parse(info.mock.calls[0][1]);
    expect(payload.traceId).toBe('9b2f6e5c-1234-4567-89ab-1234567890ab');
    expect(payload.startedAt).toBe('2026-07-10T09:44:00.000Z');
    expect(payload.final).toBe('portal_overview');
    expect(payload.totalDurationMs).toBe(5);
    expect(payload.decisions[0]).toMatchObject({
      context: 'Product Context',
      outcome: 'declined',
      confidence: 0.04,
      durationMs: 0,
    });
    expect(payload.decisions[1]).toMatchObject({
      context: 'Overview Context',
      outcome: 'accepted',
      confidence: 0.99,
      durationMs: 2,
    });
    info.mockRestore();
  });
});
