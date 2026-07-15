import { describe, expect, it } from 'vitest';
import {
  getSqlReportDefinition,
  listSqlReports,
  validateSqlReportParams,
} from '../../api/_sql-reports.js';

describe('sql report catalogue', () => {
  it('lists the five approved reports', () => {
    const reports = listSqlReports();
    expect(reports.map((report) => report.id)).toEqual([
      'inventory.product_lookup',
      'inventory.stock_by_department',
      'sales.top_products',
      'sales.product_monthly',
      'sales.invoice_lines',
    ]);
  });

  it('rejects unapproved reports', () => {
    expect(() => validateSqlReportParams('finance.margin_report', {})).toThrow(/Unapproved report/);
  });

  it('rejects missing required parameters', () => {
    expect(() => validateSqlReportParams('sales.product_monthly', {})).toThrow(/Missing required parameter: sku/);
  });

  it('rejects unknown parameters', () => {
    expect(() => validateSqlReportParams('sales.product_monthly', {
      sku: '8612200123',
      surprise: true,
    })).toThrow(/Unknown parameters: surprise/);
  });

  it('validates enum and date values', () => {
    expect(() => validateSqlReportParams('sales.top_products', {
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      sortBy: 'margin',
    })).toThrow(/must be one of/);

    expect(() => validateSqlReportParams('sales.top_products', {
      startDate: '01-01-2026',
      endDate: '2026-06-30',
    })).toThrow(/YYYY-MM-DD/);
  });

  it('normalizes approved report parameters', () => {
    const params = validateSqlReportParams('sales.invoice_lines', {
      sku: '8612200123',
      days: 30,
    });
    expect(params).toMatchObject({
      sku: '8612200123',
      days: 30,
      limit: 200,
    });
    expect(getSqlReportDefinition('sales.invoice_lines').maxRows).toBe(500);
  });
});
