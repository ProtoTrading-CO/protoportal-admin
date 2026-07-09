import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('erp.top_line_items — Positill sales', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns Positill line items when SQL is available', async () => {
    vi.doMock('../../api/_sql-sales.js', () => ({
      isPositillSalesConfigured: () => true,
      sastPeriodBounds: () => ({ label: 'today (Positill · SAST)' }),
      fetchPositillTopSellers: vi.fn(async () => ({
        items: [{ code: '8621500034', title: 'PAINT SET', totalQty: 300, totalValue: 15000, invoiceCount: 12 }],
        invoiceHeaderCount: 34,
        periodLabel: 'today (Positill · SAST)',
        dataSource: 'erp_sql',
      })),
    }));

    const mod = await import('../../api/intelligence/query-engine/queries/erp.top_line_items.js');
    const result = await mod.default.run(null, { period: 'today', scope: 'top_sellers', limit: 10 });
    expect(result.source).toEqual(['erp_sql']);
    expect(result.data.invoiceHeaderCount).toBe(34);
    expect(result.data.items[0].code).toBe('8621500034');
    expect(result.data.dataSource).toBe('erp_sql');
  });

  it('throws ERP_UNAVAILABLE when Positill SQL is not configured', async () => {
    vi.doMock('../../api/_sql-sales.js', () => ({
      isPositillSalesConfigured: () => false,
      sastPeriodBounds: () => ({ label: 'today' }),
      fetchPositillTopSellers: vi.fn(),
    }));

    const mod = await import('../../api/intelligence/query-engine/queries/erp.top_line_items.js');
    await expect(mod.default.run(null, { period: 'today' })).rejects.toMatchObject({ code: 'ERP_UNAVAILABLE' });
  });
});

describe('buildSalesContext — Positill preference', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uses Positill ERP when erp.top_line_items succeeds', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async (queryId) => {
        if (queryId === 'erp.top_line_items') {
          return {
            ok: true,
            data: {
              period: 'today',
              periodLabel: 'today (Positill · SAST)',
              scope: 'top_sellers',
              invoiceHeaderCount: 34,
              items: [{ code: '8621500034', name: 'PAINT SET', title: 'PAINT SET', totalQty: 300, invoiceCount: 12 }],
              dataSource: 'erp_sql',
            },
            meta: { source: ['erp_sql'], warnings: [], partial: false },
          };
        }
        throw new Error('unexpected query');
      }),
    }));

    const { buildSalesContext } = await import('../../api/intelligence/bi/contexts/sales.js');
    const env = await buildSalesContext({ scope: 'top_sellers', period: 'today', query: 'best seller today' });
    expect(env.data.dataSource).toBe('positill_erp');
    expect(env.data.invoiceCount).toBe(34);
    expect(env.data.top.code).toBe('8621500034');
    expect(env.data.evidence.invoiceCount.source).toBe('erp_sql');
  });

  it('returns ERP error when Positill is unavailable — no portal fallback', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async (queryId) => {
        if (queryId === 'erp.top_line_items') {
          return { ok: false, error: { code: 'ERP_UNAVAILABLE', message: 'bridge offline' }, meta: { source: [] } };
        }
        throw new Error(`unexpected query: ${queryId}`);
      }),
    }));

    const { buildSalesContext } = await import('../../api/intelligence/bi/contexts/sales.js');
    const env = await buildSalesContext({ scope: 'top_sellers', period: 'today', channel: 'positill' });
    expect(env.ok).toBe(false);
    expect(env.error?.code).toBe('ERP_UNAVAILABLE');
  });

  it('uses portal orders only when website channel is requested', async () => {
    vi.doMock('../../api/intelligence/query-engine/execute.js', () => ({
      executeQuery: vi.fn(async (queryId) => {
        if (queryId === 'portal.top_line_items') {
          return {
            ok: true,
            data: {
              period: 'today',
              periodLabel: 'today (SAST)',
              scope: 'top_sellers',
              orderCount: 2,
              items: [{ code: 'WEB001', name: 'Web Product', totalQty: 5, orderCount: 2 }],
            },
            meta: { source: ['portal_supabase'], warnings: [], partial: false },
          };
        }
        throw new Error(`unexpected query: ${queryId}`);
      }),
    }));

    const { buildSalesContext } = await import('../../api/intelligence/bi/contexts/sales.js');
    const env = await buildSalesContext({ scope: 'top_sellers', period: 'today', channel: 'website' });
    expect(env.data.dataSource).toBe('portal_orders');
    expect(env.data.channel).toBe('website');
  });
});

describe('formatSalesContext — Positill voice', () => {
  it('labels Positill invoices in the response', async () => {
    const { formatSalesContext } = await import('../../api/intelligence/bi/format/sales.js');
    const text = formatSalesContext({
      data: {
        taught: true,
        dataSource: 'positill_erp',
        scope: 'top_sellers',
        periodLabel: 'today (Positill · SAST)',
        invoiceCount: 34,
        orderCount: 34,
        results: [{ code: '8621500034', name: 'PAINT SET', totalQty: 300, invoiceCount: 12 }],
        top: { code: '8621500034', name: 'PAINT SET', totalQty: 300 },
        status: { code: 'ok' },
        evidence: {},
        notAvailable: [],
      },
      meta: { source: ['erp_sql'] },
    });
    expect(text).toContain('Positill POS');
    expect(text).toContain('34');
    expect(text).toContain('8621500034');
    expect(text).not.toContain('website portal orders (not ERP');
  });
});
