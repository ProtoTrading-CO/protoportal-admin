import { describe, expect, it } from 'vitest';
import {
  buildBusinessExceptions,
  detectCustomerBehaviourChanges,
  detectErpWebsiteExceptions,
  detectSalesAnomalies,
  detectStockCoverRisks,
  detectSupplierDelays,
} from '../../api/_apollo-exception-engine.js';

describe('Apollo exception engine', () => {
  it('detects sales anomalies with evidence, confidence, and recommendation', () => {
    const [item] = detectSalesAnomalies({
      today: [{ code: '8616700111', name: 'Leather Wallet', totalQty: 42 }],
      baseline: [{ code: '8616700111', name: 'Leather Wallet', totalQty: 140 }],
    });

    expect(item).toMatchObject({
      category: 'sales_anomaly',
      severity: 'action',
      recommendation: 'Review stock cover before demand outruns supply.',
    });
    expect(item.payload.confidence).toBeGreaterThanOrEqual(80);
    expect(item.payload.businessImpact).toBe('high');
    expect(item.payload.evidence.map((row) => row.label)).toEqual(expect.arrayContaining(['Change']));
    expect(item.title).toMatch(/^8616700111 · Leather Wallet sales spiked$/);
  });

  it('detects ERP and website stock and price exceptions', () => {
    const items = detectErpWebsiteExceptions({
      products: [{
        code: 'SKU1',
        erp: { descr: 'Wallet', onhand: 100, price_a: 100 },
        website: { sku: 'SKU1', title: 'Wallet', available_stock: 20, price: 150 },
      }],
    });

    expect(items.map((item) => item.dedupeKey)).toEqual(expect.arrayContaining([
      'exception:erp_website_exception:SKU1:stock-mismatch',
      'exception:erp_website_exception:SKU1:price-mismatch',
    ]));
    expect(items.every((item) => item.recommendation.includes('synchronisation'))).toBe(true);
  });

  it('calculates stock cover risk and recommends action', () => {
    const [item] = detectStockCoverRisks({
      products: [{
        code: 'SKU2',
        title: 'Coin Purse',
        stockQty: 18,
        dailySalesVelocity: 3,
        leadTimeDays: 35,
        salesSampleDays: 7,
      }],
    });

    expect(item).toMatchObject({
      category: 'stock_cover_risk',
      severity: 'critical',
    });
    expect(item.recommendation).toMatch(/Order now/);
    expect(item.payload.evidence.find((row) => row.label === 'Stock cover')?.value).toBe('6 days');
  });

  it('detects high-confidence customer behaviour changes', () => {
    const items = detectCustomerBehaviourChanges({
      customers: [{
        id: 'cust-1',
        name: 'Addie',
        orderCount: 6,
        totalSpend: 25000,
        normalOrderGapDays: 14,
        daysSinceLastOrder: 32,
        averageOrderValue: 2000,
        latestOrderValue: 900,
      }],
    });

    expect(items.map((item) => item.category)).toEqual(expect.arrayContaining(['customer_behaviour_change']));
    expect(items.every((item) => item.payload.confidence >= 80)).toBe(true);
    expect(items[0].payload.query).toBe('Find customer Addie');
  });

  it('detects supplier delay exceptions', () => {
    const [item] = detectSupplierDelays({
      suppliers: [{
        supplier: 'Motarro',
        lateDeliveries: 3,
        outstandingCommitments: 2,
        averageLeadTimeDays: 48,
        normalLeadTimeDays: 35,
      }],
    });

    expect(item).toMatchObject({
      category: 'supplier_delay',
      severity: 'action',
      title: 'Motarro supplier delay risk',
    });
    expect(item.payload.businessImpact).toBe('high');
  });

  it('builds a sorted cross-domain exception list', () => {
    const items = buildBusinessExceptions({
      sales: {
        today: [{ code: 'SKU1', name: 'Wallet', totalQty: 42 }],
        baseline: [{ code: 'SKU1', name: 'Wallet', totalQty: 140 }],
      },
      erpWebsite: {
        products: [{ code: 'SKU1', erp: { onhand: 100 }, website: { available_stock: 0 } }],
      },
      stockCover: {
        products: [{ code: 'SKU1', title: 'Wallet', stockQty: 9, dailySalesVelocity: 3, leadTimeDays: 35, salesSampleDays: 7 }],
      },
      customers: {
        customers: [{ name: 'Addie', orderCount: 5, totalSpend: 20000, normalOrderGapDays: 10, daysSinceLastOrder: 25 }],
      },
      suppliers: {
        suppliers: [{ supplier: 'Motarro', lateDeliveries: 2, outstandingCommitments: 4, averageLeadTimeDays: 50, normalLeadTimeDays: 35 }],
      },
    });

    expect(items.length).toBeGreaterThanOrEqual(5);
    expect([...new Set(items.map((item) => item.category))]).toEqual(expect.arrayContaining([
      'sales_anomaly',
      'erp_website_exception',
      'stock_cover_risk',
      'customer_behaviour_change',
      'supplier_delay',
    ]));
    expect(items[0].payload.businessImpact).toMatch(/critical|high/);
  });
});
