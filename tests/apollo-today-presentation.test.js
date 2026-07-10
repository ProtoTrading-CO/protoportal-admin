import { describe, it, expect } from 'vitest';
import {
  buildExecutiveSummary,
  businessHealthWithCrm,
  displayNameFromEmail,
  focusShowsViewAll,
  filterInventoryOps,
  buildBuyingOps,
  buildOrderOps,
  buildSupplierOps,
  displaySeverity,
} from '../src/lib/apolloTodayPresentation.js';

const sampleContext = {
  focusToday: [
    { type: 'negative_stock', title: '3+ products with negative stock', why: 'x', action: 'y' },
    { type: 'inactive_customer', title: 'Acme — quiet for 92 days', why: 'x', action: 'y' },
  ],
  businessHealth: [
    { key: 'sales', label: 'Sales', status: '2 orders yesterday', severity: 'healthy' },
    { key: 'customers', label: 'Customers', status: 'All clear', severity: 'healthy' },
    { key: 'inventory', label: 'Inventory', status: '3 negative stock', severity: 'urgent' },
    { key: 'website', label: 'Website', status: 'No changes', severity: 'healthy' },
  ],
  whatChangedSinceYesterday: [
    { type: 'orders', text: '2 portal orders received · R 12,000 ex VAT', severity: 'info' },
  ],
  customerAlerts: { pending: [], items: [] },
  inventoryAlerts: { negative: [{ sku: '1' }], low: [], zero: [], high: [] },
};

describe('apolloTodayPresentation', () => {
  it('maps admin emails to display names', () => {
    expect(displayNameFromEmail('george@proto.co.za')).toBe('Gee');
    expect(displayNameFromEmail('unknown@x.com')).toBe('Unknown');
  });

  it('builds at most three executive summary sentences', () => {
    const lines = buildExecutiveSummary(sampleContext, { userName: 'Gee', hour: 9 });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Good morning Gee.');
    expect(lines[1]).toMatch(/important issues/);
    expect(lines[2]).toMatch(/\./);
  });

  it('leads with danger-of-forgetting notifications when present', () => {
    const lines = buildExecutiveSummary({
      ...sampleContext,
      notifications: { counts: { total: 2 } },
      focusToday: [
        { type: 'notification_overdue_commitments', title: 'Commitment overdue: quote Addie' },
      ],
    }, { userName: 'Gee', hour: 9 });
    expect(lines[1]).toMatch(/danger of being forgotten/i);
    expect(lines[2]).toMatch(/commitment overdue/i);
  });

  it('leads with noticed exceptions when Release 1.2 exception alerts are present', () => {
    const lines = buildExecutiveSummary({
      ...sampleContext,
      notifications: { counts: { total: 1 } },
      exceptionAlerts: {
        items: [{ category: 'sales_anomaly', title: 'Wallet sales spiked' }],
      },
      focusToday: [
        { type: 'notification_sales_anomaly', title: 'Wallet sales spiked' },
      ],
    }, { userName: 'Gee', hour: 9 });
    expect(lines[1]).toMatch(/Apollo noticed one meaningful business exception/i);
    expect(lines[2]).toMatch(/wallet sales spiked/i);
  });

  it('maps Release 1.2 severity values onto existing visual classes', () => {
    expect(displaySeverity('critical')).toBe('urgent');
    expect(displaySeverity('action')).toBe('attention');
    expect(displaySeverity('review')).toBe('attention');
    expect(displaySeverity('info')).toBe('info');
  });

  it('adds CRM pulse from customer alerts', () => {
    const health = businessHealthWithCrm({
      businessHealth: sampleContext.businessHealth,
      customerAlerts: { pending: [{ id: '1' }], items: [] },
    });
    expect(health).toHaveLength(5);
    expect(health.find((h) => h.key === 'crm')?.status).toMatch(/approval/);
  });

  it('detects view-all for bulk focus items', () => {
    expect(focusShowsViewAll({ title: '12+ products with negative stock' })).toBe(true);
    expect(focusShowsViewAll({ title: 'One customer awaiting approval' })).toBe(false);
  });

  it('skips inventory ops already in focus', () => {
    const focusTypes = new Set(['negative_stock']);
    const rows = filterInventoryOps(sampleContext.inventoryAlerts, focusTypes);
    expect(rows.every((r) => r.kind !== 'negative')).toBe(true);
  });

  it('turns notifications into order ops with workspace URLs', () => {
    const rows = buildOrderOps({
      notifications: {
        items: [{
          id: 'n1',
          category: 'inactive_orders',
          title: 'Addie order inactive',
          detail: 'Last updated 2 days ago',
          severity: 'attention',
          actionUrl: '/apollo/orders/abc',
        }],
      },
      focusToday: [],
      orderAlerts: { needingReview: [] },
    }, new Set());
    expect(rows[0]).toMatchObject({
      title: 'Addie order inactive',
      url: '/apollo/orders/abc',
    });
  });

  it('keeps buying and supplier advisory rows separate from orders', () => {
    const context = {
      focusToday: [],
      notifications: {
        items: [{
          id: 'order-risk',
          category: 'inactive_orders',
          title: 'Addie order inactive',
          detail: 'Last updated 2 days ago',
          severity: 'attention',
          actionUrl: '/apollo/orders/abc',
        }, {
          id: 'buying-risk',
          category: 'buying_review_due',
          title: 'Buying review: Leather Wallet',
          detail: '8616700111 · Motarro · stock 0',
          severity: 'attention',
          payload: { query: 'Show product 8616700111' },
        }],
      },
      buyingAlerts: {
        items: [{
          id: 'buying-risk',
          title: 'Buying review: Leather Wallet',
          detail: '8616700111 · Motarro · stock 0',
          severity: 'attention',
          payload: { query: 'Show product 8616700111' },
        }],
      },
      supplierAlerts: {
        items: [{
          id: 'supplier-risk',
          title: 'Supplier follow-up: Motarro',
          detail: '3 products need stock or buying attention',
          severity: 'attention',
          payload: { supplier: 'Motarro', query: 'Motarro' },
        }],
      },
      orderAlerts: { needingReview: [] },
    };

    expect(buildOrderOps(context, new Set()).map((row) => row.id)).toEqual(['order-risk']);
    expect(buildBuyingOps(context)[0]).toMatchObject({ id: 'buying-risk', query: 'Show product 8616700111' });
    expect(buildSupplierOps(context)[0]).toMatchObject({ id: 'supplier-risk', query: 'Motarro' });
  });
});
