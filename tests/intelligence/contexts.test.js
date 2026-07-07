import { describe, it, expect } from 'vitest';
import { formatProductContext } from '../../api/intelligence/bi/format/product.js';
import { formatCustomerContext } from '../../api/intelligence/bi/format/customer.js';
import { formatInventoryContext } from '../../api/intelligence/bi/format/inventory.js';
import { formatDailyBriefContext } from '../../api/intelligence/bi/format/daily-brief.js';
import { daysSince } from '../../api/intelligence/bi/contexts/_helpers.js';

const baseMeta = {
  source: ['portal_supabase'],
  partial: false,
  warnings: [],
  generatedAt: '2026-07-07T08:00:00.000Z',
  cache: 'miss',
};

describe('business context formatters', () => {
  it('formatProductContext includes provenance and notAvailable', () => {
    const md = formatProductContext({
      data: {
        type: 'product',
        code: '8610100001',
        erp: { title: 'Test', onhand: 5, booked: 0, available: 5, price: 100 },
        website: { sku: '8610100001', title: 'Test', category: 'Art' },
        stock: { onHand: 5, source: 'website_stock' },
        supplier: { name: 'Acme', department: 'ART' },
        imageUrl: null,
        status: { code: 'live_on_website', label: 'Live on website' },
        notAvailable: ['margin', 'forecast'],
      },
      meta: baseMeta,
    });
    expect(md).toContain('## Product 8610100001');
    expect(md).toContain('Acme');
    expect(md).toContain('margin');
    expect(md).toContain('Sources:');
  });

  it('formatCustomerContext shows days since last order', () => {
    const md = formatCustomerContext({
      data: {
        type: 'customer',
        profile: { id: '1', name: 'Jane', business: 'Co', tier: 'regular', joined: '2025-01-01' },
        contact: { email: 'j@co.za', phone: '082', city: 'JHB', province: 'GP' },
        approval: { approved: true, status: 'approved' },
        orders: { recent: [], count: 0, spendExVat: 0, daysSinceLastOrder: 42 },
        matches: [],
        query: 'Jane',
        notAvailable: ['outstanding_balance'],
      },
      meta: baseMeta,
    });
    expect(md).toContain('Days since last order');
    expect(md).toContain('42');
  });

  it('formatInventoryContext renders attention items with reason', () => {
    const md = formatInventoryContext({
      data: {
        type: 'inventory',
        lists: {
          negative: [{
            sku: 'SKU1',
            title: 'Widget',
            stockQty: -2,
            supplier: 'Supp',
            reason: 'Stock below zero',
          }],
          low: [],
          zero: [],
          high: [],
        },
        notAvailable: [],
      },
      meta: baseMeta,
    }, { type: 'negative' });
    expect(md).toContain('Negative stock');
    expect(md).toContain('Widget');
    expect(md).toContain('Stock below zero');
  });

  it('formatDailyBriefContext includes why and action on focus items', () => {
    const md = formatDailyBriefContext({
      data: {
        type: 'daily_brief',
        yesterday: { orderCount: 0, orders: [], listingsCount: 0, listingsUpdated: [], orderTotalExVat: 0, summary: [] },
        focusToday: [{
          label: '2 customers awaiting approval',
          detail: 'A — a@b.com',
          why: 'New trade accounts are waiting.',
          action: 'Review and approve.',
        }],
        inventoryAlerts: { negative: [], low: [], zero: [], high: [] },
        customerAlerts: { pending: [], count: 0, items: [] },
        orderAlerts: { needingReview: [], count: 0 },
        quietSignals: [],
        notAvailable: [],
      },
      meta: baseMeta,
    });
    expect(md).toContain('Why:');
    expect(md).toContain('Do:');
  });
});

describe('context helpers', () => {
  it('daysSince calculates whole days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
    expect(daysSince(threeDaysAgo)).toBeGreaterThanOrEqual(2);
  });
});
