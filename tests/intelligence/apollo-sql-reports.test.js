import { describe, expect, it } from 'vitest';
import {
  formatSqlReportListReply,
  isSqlReportListQuery,
  isSqlReportRunQuery,
  resolveSqlReportRoute,
} from '../../api/apollo-sql-reports.js';

describe('apollo sql report routing', () => {
  it('detects list-catalogue prompts', () => {
    expect(isSqlReportListQuery('Show me the available SQL reports')).toBe(true);
    expect(resolveSqlReportRoute('Show me the available SQL reports')).toEqual({
      reportId: null,
      params: {},
      mode: 'list',
    });
  });

  it('routes monthly sales prompts', () => {
    const route = resolveSqlReportRoute('Monthly sales for SKU 8612200123 for the last 12 months');
    expect(route).toEqual({
      reportId: 'sales.product_monthly',
      params: { sku: '8612200123', months: 12 },
      mode: 'run',
    });
  });

  it('routes department stock prompts', () => {
    const route = resolveSqlReportRoute('Stock report for department 12 showing negative stock');
    expect(route).toEqual({
      reportId: 'inventory.stock_by_department',
      params: { department: '12', negativeOnly: true, limit: 100 },
      mode: 'run',
    });
  });

  it('routes top-selling date-range prompts', () => {
    const route = resolveSqlReportRoute('Top-selling report from 2026-01-01 to 2026-06-30 by revenue');
    expect(route).toEqual({
      reportId: 'sales.top_products',
      params: {
        startDate: '2026-01-01',
        endDate: '2026-06-30',
        sortBy: 'revenue',
        limit: 25,
      },
      mode: 'run',
    });
  });

  it('routes invoice-line prompts', () => {
    const route = resolveSqlReportRoute('Invoice-line report for SKU 8612200123 for the last 30 days');
    expect(route).toEqual({
      reportId: 'sales.invoice_lines',
      params: { sku: '8612200123', days: 30 },
      mode: 'run',
    });
  });

  it('does not route ordinary negative-stock website questions', () => {
    expect(isSqlReportRunQuery('Which products have negative stock?')).toBe(false);
    expect(resolveSqlReportRoute('Which products have negative stock?')).toBeNull();
    expect(resolveSqlReportRoute('Find customer Plushprops')).toBeNull();
  });

  it('formats catalogue replies with POSWINSQL source', () => {
    const reply = formatSqlReportListReply();
    expect(reply.reply).toMatch(/Approved SQL reports/);
    expect(reply.reply).toMatch(/POSWINSQL/);
    expect(reply.intent).toBe('sql_report_list');
  });
});
