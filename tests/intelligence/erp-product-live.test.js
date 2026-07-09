import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveProductByCode } from '../../api/_sql-provider.js';

describe('erp.product_by_code — data source', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('reports erp_sql when live bridge returns a row', async () => {
    vi.doMock('../../api/_sql-provider.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        resolveProductByCode: vi.fn(async () => ({
          product: { code: '8614001234', title: 'Live Wallet', price: 99, onhand: 10, booked: 2, available: 8, dept: 'LTH' },
          dataSource: 'erp_sql',
          bridgeAttempted: true,
        })),
      };
    });

    const mod = await import('../../api/intelligence/query-engine/queries/erp.product_by_code.js');
    const result = await mod.default.run(null, { code: '8614001234' });
    expect(result.source).toEqual(['erp_sql']);
    expect(result.data.dataSource).toBe('erp_sql');
    expect(result.warnings).not.toContain('BRIDGE_OFFLINE');
  });

  it('reports stmast_cache and BRIDGE_OFFLINE when bridge configured but cache used', async () => {
    vi.doMock('../../api/_sql-provider.js', async (importOriginal) => {
      const actual = await importOriginal();
      return {
        ...actual,
        resolveProductByCode: vi.fn(async () => ({
          product: { code: '8614001234', title: 'Cached', price: 50, onhand: 1, booked: 0, available: 1, dept: 'ART' },
          dataSource: 'stmast_cache',
          bridgeAttempted: true,
        })),
      };
    });

    const mod = await import('../../api/intelligence/query-engine/queries/erp.product_by_code.js');
    const result = await mod.default.run(null, { code: '8614001234' });
    expect(result.source).toEqual(['stmast_cache']);
    expect(result.warnings).toContain('BRIDGE_OFFLINE');
  });
});

describe('buildProductContext — live ERP preference', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses live ERP fields and stmast_cache only for supplier enrichment', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async (queryId) => {
        if (queryId === 'erp.product_by_code') {
          return {
            ok: true,
            data: {
              product: { code: '8614001234', title: 'Live', price: 100, onhand: 20, booked: 5, available: 15, dept: 'LTH' },
              dataSource: 'erp_sql',
            },
            meta: { source: ['erp_sql'], warnings: [], partial: false, cache: 'miss' },
          };
        }
        if (queryId === 'stock.website_stock_by_sku') {
          return { ok: true, data: { listing: null }, meta: { source: ['website_stock'], warnings: [] } };
        }
        if (queryId === 'stock.stmast_cache_by_code') {
          return {
            ok: true,
            data: {
              row: { code: '8614001234', supplier: 'Motarro', dept: 'OLD', price_a: 1, barcode: '123' },
            },
            meta: { source: ['stmast_cache'], warnings: [] },
          };
        }
        if (queryId === 'stock.products_soh_by_skus') {
          return { ok: true, data: { products: [] }, meta: { source: ['portal_supabase'], warnings: [] } };
        }
        return { ok: true, data: {}, meta: { source: [], warnings: [] } };
      }),
    }));

    const { buildProductContext: build } = await import('../../api/intelligence/bi/contexts/product.js');
    const env = await build({ code: '8614001234' });
    expect(env.data.erpDataSource).toBe('erp_sql');
    expect(env.data.liveErp).toBe(true);
    expect(env.data.erp.dept).toBe('LTH');
    expect(env.data.price).toBe(100);
    expect(env.data.supplier.name).toBe('Motarro');
    expect(env.data.supplier.department).toBe('LTH');
    expect(env.data.evidence?.title?.source).toBe('erp_sql');
    expect(env.data.evidence?.title?.confidence).toBeGreaterThan(0.9);
    expect(env.data.evidence?.supplier?.source).toBe('stmast_cache');
    expect(env.meta.source).toContain('erp_sql');
  });
});

describe('resolveProductByCode export', () => {
  it('is exported from sql provider', () => {
    expect(typeof resolveProductByCode).toBe('function');
  });
});
