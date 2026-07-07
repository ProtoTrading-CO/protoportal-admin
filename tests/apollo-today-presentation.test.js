import { describe, it, expect } from 'vitest';
import {
  buildExecutiveSummary,
  businessHealthWithCrm,
  displayNameFromEmail,
  focusShowsViewAll,
  filterInventoryOps,
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
});
