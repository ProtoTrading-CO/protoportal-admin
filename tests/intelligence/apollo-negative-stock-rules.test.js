import { describe, expect, it } from 'vitest';
import {
  PROTO_NEGATIVE_STOCK_RULES,
  buildNegativeStockNotifications,
  classifyNegativeStock,
  summarizeNegativeStock,
} from '../../api/_apollo-negative-stock-rules.js';
import { detectNegativeStockInvestigations } from '../../api/_apollo-exception-engine.js';
import { buildBuyingSupplierNotifications } from '../../api/_apollo-notifications-core.js';

const now = new Date('2026-07-10T12:00:00.000Z');

describe('Proto negative stock business rules', () => {
  it('classifies recent GRV as temporary timing, not immediate investigation', () => {
    const row = classifyNegativeStock({
      sku: '8616700111',
      title: 'Leather Wallet',
      stockQty: -3,
      supplier: 'Motarro',
      recentGrvAt: '2026-07-10T08:00:00.000Z',
    }, { now });

    expect(row).toMatchObject({
      kind: 'temporary_timing',
      category: 'stock_timing',
      severity: 'review',
      badgeKey: 'stock_awaiting_grv',
      recommendation: 'Temporary stock timing during GRV processing. No action required.',
    });
    expect(row.title).toMatch(/Stock awaiting GRV/);
  });

  it('classifies pending GRV as in progress', () => {
    const row = classifyNegativeStock({
      sku: '8616700222',
      title: 'Coin Purse',
      stockQty: -6,
      pendingGrv: true,
    }, { now });

    expect(row.kind).toBe('grv_in_progress');
    expect(row.badgeKey).toBe('grv_in_progress');
    expect(row.title).toMatch(/GRV in progress/);
  });

  it('escalates only when negative stock persists, sells, and magnitude is significant', () => {
    const existingByKey = new Map([
      ['buying:8616700333:negative-timing', { detected_at: '2026-07-08T12:00:00.000Z' }],
    ]);

    const row = classifyNegativeStock({
      sku: '8616700333',
      title: 'Travel Wallet',
      stockQty: -14,
      supplier: 'Motarro',
    }, { now, salesRank: 2, existingByKey });

    expect(row).toMatchObject({
      kind: 'investigate',
      category: 'negative_stock_investigation',
      severity: 'action',
      badgeKey: 'inventory_investigation',
    });
    expect(row.recommendation).toMatch(/persisted for 48 hours/i);
    expect(row.title).toMatch(/Stock discrepancy/);
  });

  it('does not escalate small negative stock without persistence evidence', () => {
    const row = classifyNegativeStock({
      sku: '8616700444',
      title: 'Key Ring',
      stockQty: -2,
    }, { now, salesRank: 1 });

    expect(row.kind).toBe('temporary_timing');
    expect(row.severity).toBe('review');
  });

  it('builds buying notifications without urgent negative-stock noise', () => {
    const items = buildBuyingSupplierNotifications({
      inventory: {
        lists: {
          negative: [{ sku: '8616700111', title: 'Leather Wallet', stockQty: -4, supplier: 'Motarro', recentGrvAt: '2026-07-10T10:00:00.000Z' }],
          zero: [],
          low: [],
        },
      },
      sales: { results: [] },
      now,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      category: 'stock_timing',
      severity: 'review',
      dedupeKey: 'buying:8616700111:negative-timing',
    });
    expect(items[0].priorityScore).toBeLessThan(80);
  });

  it('summarizes investigate vs timing buckets for daily brief', () => {
    const summary = summarizeNegativeStock([
      { sku: 'A', stockQty: -3, recentGrvAt: '2026-07-10T10:00:00.000Z' },
      { sku: 'B', stockQty: -12, supplier: 'Motarro' },
    ], {
      now,
      salesByCode: new Map([['B', { rank: 1 }]]),
      existingByKey: new Map([
        ['buying:B:negative-timing', { detected_at: '2026-07-08T12:00:00.000Z' }],
      ]),
    });

    expect(summary.timing).toHaveLength(1);
    expect(summary.investigate).toHaveLength(1);
  });

  it('exports the permanent Proto business principle', () => {
    expect(PROTO_NEGATIVE_STOCK_RULES.principle).toMatch(/unexpected behaviour/i);
  });

  it('raises exception-engine investigations only for abnormal negatives', () => {
    const items = detectNegativeStockInvestigations({
      products: [{ sku: '8616700333', title: 'Travel Wallet', stockQty: -14, supplier: 'Motarro' }],
      sales: { results: [{ code: '8616700333', totalQty: 12 }] },
      existingByKey: new Map([
        ['buying:8616700333:negative-timing', { detected_at: '2026-07-08T12:00:00.000Z' }],
      ]),
      now,
    });

    expect(items).toHaveLength(1);
    expect(items[0].category).toBe('negative_stock_investigation');
    expect(items[0].severity).toBe('action');
  });
});
