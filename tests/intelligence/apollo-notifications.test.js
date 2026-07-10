import { describe, expect, it } from 'vitest';
import {
  buildBuyingSupplierNotifications,
  buildOrderWorkspaceNotifications,
  businessHealthScore,
  notificationCounts,
  notificationToFocus,
} from '../../api/_apollo-notifications-core.js';
import { buildValidationReport } from '../../api/apollo-notifications.js';

const now = new Date('2026-07-10T09:00:00.000Z');

function workspace(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'Draft',
    command: '/order Addie',
    due_date: '2026-07-12',
    updated_at: '2026-07-10T08:00:00.000Z',
    created_at: '2026-07-10T08:00:00.000Z',
    customer: { customer_name: 'Addie' },
    tasks: [],
    commitments: [],
    reminders: [],
    ...overrides,
  };
}

describe('Apollo notification engine', () => {
  it('generates overdue commitments, reminders, tasks, inactive orders, and due dates', () => {
    const items = buildOrderWorkspaceNotifications([
      workspace({
        due_date: '2026-07-09',
        updated_at: '2026-07-07T08:00:00.000Z',
        tasks: [{ id: '22222222-2222-4222-8222-222222222222', title: 'Send quotation', status: 'Open', due_date: '2026-07-09' }],
        commitments: [{ id: '33333333-3333-4333-8333-333333333333', promise_text: "We'll quote tomorrow", status: 'Open', due_date: '2026-07-09' }],
        reminders: [{ id: '44444444-4444-4444-8444-444444444444', title: 'Quotation due', status: 'Open', due_date: '2026-07-10' }],
      }),
    ], { now });

    expect(items.map((i) => i.category)).toEqual(expect.arrayContaining([
      'orders_overdue',
      'inactive_orders',
      'open_tasks',
      'overdue_commitments',
      'due_reminders',
    ]));
    expect(items[0].priorityScore).toBeGreaterThanOrEqual(items.at(-1).priorityScore);
    expect(items.every((i) => i.actionUrl === '/apollo/orders/11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('summarizes counts and health score for Daily Brief', () => {
    const items = buildOrderWorkspaceNotifications([
      workspace({ due_date: '2026-07-09' }),
      workspace({ id: '55555555-5555-4555-8555-555555555555', due_date: '2026-07-11' }),
    ], { now });
    const counts = notificationCounts(items);
    expect(counts.total).toBe(2);
    expect(counts.urgent).toBe(1);
    expect(businessHealthScore(items)).toBeLessThan(10);
  });

  it('counts Release 1.2 exception severities', () => {
    const counts = notificationCounts([
      { severity: 'critical', category: 'stock_cover_risk' },
      { severity: 'action', category: 'sales_anomaly' },
      { severity: 'review', category: 'erp_website_exception' },
    ]);
    expect(counts).toMatchObject({
      total: 3,
      urgent: 1,
      attention: 2,
      critical: 1,
      action: 1,
      review: 1,
    });
  });

  it('converts notifications into focus cards with stable workspace URLs', () => {
    const [item] = buildOrderWorkspaceNotifications([workspace({ due_date: '2026-07-09' })], { now });
    expect(notificationToFocus(item, 1)).toMatchObject({
      type: 'notification_orders_overdue',
      url: '/apollo/orders/11111111-1111-4111-8111-111111111111',
      workspace: 'orders',
    });
  });

  it('converts exception notifications into Apollo focus cards with evidence', () => {
    const item = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      dedupeKey: 'exception:sales_anomaly:SKU1:spike',
      category: 'sales_anomaly',
      severity: 'action',
      title: 'Wallet sales spiked',
      detail: 'SKU1 is 42% above recent trend',
      recommendation: 'Review stock cover before demand outruns supply.',
      actionUrl: '',
      payload: {
        release: 'apollo-operational-v1.2',
        confidence: 94,
        businessImpact: 'high',
        evidence: [{ label: 'Sales', value: '+42%' }, { label: 'Stock cover', value: '9 days' }],
        query: 'Show product SKU1',
      },
    };

    expect(notificationToFocus(item, 1)).toMatchObject({
      type: 'notification_sales_anomaly',
      workspace: 'apollo',
      query: 'Show product SKU1',
      confidence: 94,
      businessImpact: 'high',
      evidence: 'Sales: +42% · Stock cover: 9 days',
      notificationDbId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
  });

  it('builds validation reports from reviewed exceptions', () => {
    const report = buildValidationReport([
      {
        category: 'sales_anomaly',
        confidence: 94,
        business_impact: 'high',
        feedback_status: 'useful',
        payload: { release: 'apollo-operational-v1.2' },
      },
      {
        category: 'stock_cover_risk',
        confidence: 82,
        business_impact: 'critical',
        feedback_status: 'false_positive',
        payload: { release: 'apollo-operational-v1.2' },
      },
      {
        category: 'stock_cover_risk',
        confidence: 78,
        business_impact: 'medium',
        feedback_status: 'needs_threshold_adjustment',
        payload: { release: 'apollo-operational-v1.2' },
      },
      {
        category: 'orders_overdue',
        confidence: null,
        business_impact: null,
        feedback_status: 'useful',
        payload: {},
      },
    ]);

    expect(report).toMatchObject({
      totalExceptions: 3,
      usefulExceptions: 1,
      falsePositives: 1,
      needsThresholdAdjustment: 1,
      reviewedExceptions: 3,
      averageConfidence: 84.7,
      averageBusinessImpact: 'high',
    });
    expect(report.topRecurringExceptionTypes[0]).toEqual({ type: 'stock_cover_risk', count: 2 });
  });

  it('generates buying and supplier notifications from stock risk and sales overlap', () => {
    const items = buildBuyingSupplierNotifications({
      inventory: {
        lists: {
          negative: [],
          zero: [{ sku: '8616700111', title: 'Leather Wallet', stockQty: 0, supplier: 'Motarro' }],
          low: [
            { sku: '8616700222', title: 'Coin Purse', stockQty: 4, supplier: 'Motarro' },
            { sku: '8616700333', title: 'Travel Wallet', stockQty: 5, supplier: 'Motarro' },
          ],
        },
      },
      sales: {
        results: [{ code: '8616700111', name: 'Leather Wallet', totalQty: 38 }],
      },
    });

    expect(items.map((item) => item.category)).toEqual(expect.arrayContaining([
      'buying_review_due',
      'supplier_followups',
    ]));
    expect(items.find((item) => item.dedupeKey === 'buying:8616700111:zero')?.priorityScore).toBeGreaterThan(84);
    expect(items.find((item) => item.category === 'supplier_followups')?.payload).toMatchObject({ supplier: 'Motarro' });
  });

  it('does not duplicate stable dedupe keys for repeated generation', () => {
    const first = buildBuyingSupplierNotifications({
      inventory: {
        lists: {
          negative: [],
          zero: [{ sku: '8616700111', title: 'Leather Wallet', stockQty: 0, supplier: 'Motarro' }],
          low: [],
        },
      },
      sales: { results: [] },
    });
    const second = buildBuyingSupplierNotifications({
      inventory: {
        lists: {
          negative: [],
          zero: [{ sku: '8616700111', title: 'Leather Wallet', stockQty: 0, supplier: 'Motarro' }],
          low: [],
        },
      },
      sales: { results: [] },
    });

    expect(second.map((item) => item.dedupeKey)).toEqual(first.map((item) => item.dedupeKey));
  });
});

