import { fetchPositillTopSellers, isPositillSalesConfigured, sastPeriodBounds } from '../../../_sql-sales.js';

export default {
  id: 'erp.top_line_items',
  adapter: 'sql',
  params: {
    period: { type: 'string' },
    scope: { type: 'string' },
    limit: { type: 'number' },
  },
  maxRows: 25,
  timeoutMs: 30000,
  cacheTtlMs: 120000,

  async run(_client, params) {
    const period = String(params.period || 'today');
    const scope = String(params.scope || 'top_sellers');
    const limit = Math.min(Math.max(1, Number(params.limit) || 10), 25);

    if (!isPositillSalesConfigured()) {
      const err = new Error('Positill SQL not configured (bridge or SQL_PASSWORD)');
      err.code = 'ERP_UNAVAILABLE';
      throw err;
    }

    const result = await fetchPositillTopSellers({ period, scope, limit });
    if (!result) {
      const err = new Error('Positill sales lookup unavailable');
      err.code = 'ERP_UNAVAILABLE';
      throw err;
    }

    const { label } = sastPeriodBounds(period);

    return {
      data: {
        period,
        periodLabel: result.periodLabel || label,
        scope,
        invoiceHeaderCount: result.invoiceHeaderCount,
        items: result.items,
        dataSource: 'erp_sql',
      },
      source: ['erp_sql'],
      warnings: [],
      generatedAt: new Date().toISOString(),
    };
  },
};
