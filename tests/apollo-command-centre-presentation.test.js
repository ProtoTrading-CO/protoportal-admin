import { describe, it, expect } from 'vitest';
import {
  buildApolloRecommends,
  buildBusinessStatus,
  buildDailyBriefBullets,
  buildDailyBriefScan,
  buildHealthCard,
  buildHeroFocusItems,
  buildKnowledgeHealth,
  buildApolloResponsibilities,
  extractProductCode,
  formatWithProductCode,
  responsibilityStatusIcon,
  buildProactiveGreeting,
  categorizeFocusItem,
  diverseFocusForDisplay,
  dedupeFocusForDisplay,
  focusHeroTitle,
  groupNotificationsByUrgency,
  OPERATIONAL_MATURITY,
  rememberEmptyCopy,
  REMEMBER_TEACHING_TOPICS,
} from '../src/lib/apolloCommandCentrePresentation.js';

const duplicateStockFocus = [
  { type: 'notification_buying', priority: 1, severity: 'attention', title: 'Wallet A — sales spike', action: 'Review stock cover before demand outruns supply.', detail: '11 days cover' },
  { type: 'notification_buying', priority: 2, severity: 'attention', title: 'Wallet B — sales spike', action: 'Review stock cover before demand outruns supply.', detail: '9 days cover' },
  { type: 'notification_buying', priority: 3, severity: 'attention', title: 'Wallet C — sales spike', action: 'Review stock cover before demand outruns supply.' },
  { type: 'negative_stock', priority: 4, severity: 'urgent', title: '4+ products with negative stock', action: 'Review levels and reorder or adjust the website listing.' },
];

const sampleFocus = [
  {
    type: 'notification_buying_review',
    priority: 1,
    severity: 'action',
    title: 'Wallet stock falling',
    action: 'Increase wallet order',
    evidence: 'Sales +31% · Lead time 34 days · Stock cover 11 days',
    confidence: 96,
  },
  {
    type: 'notification_overdue_commitments',
    priority: 2,
    severity: 'urgent',
    title: 'Approve Addie quotation',
    action: 'Approve Addie quotation',
    confidence: 88,
  },
];

describe('apolloCommandCentrePresentation', () => {
  it('builds up to three diverse hero focus items with category labels', () => {
    const rows = buildHeroFocusItems(duplicateStockFocus);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows[0].categoryLabel).toBe('Buying');
    expect(new Set(rows.map((r) => r.category)).size).toBe(rows.length);
  });

  it('forces focus diversity across responsibility areas', () => {
    const mixed = [
      ...duplicateStockFocus,
      { type: 'inactive_customer', priority: 5, severity: 'attention', title: 'Approve Addie quotation', action: 'Approve quotation' },
      { type: 'notification_supplier', priority: 6, severity: 'urgent', title: 'Motarro shipment delay', action: 'Follow up' },
    ];
    const rows = buildHeroFocusItems(mixed, 3);
    const categories = rows.map((r) => r.category);
    expect(categories).toContain('buying');
    expect(categories).toContain('supplier');
    expect(categories).toContain('customer');
  });

  it('dedupes focus items by title and generic recommendation', () => {
    const distinct = dedupeFocusForDisplay(duplicateStockFocus, 5);
    expect(distinct).toHaveLength(4);
  });

  it('picks diverse focus for display', () => {
    const diverse = diverseFocusForDisplay([
      { title: 'Wallet A', type: 'notification_buying', severity: 'attention' },
      { title: 'Wallet B', type: 'notification_buying', severity: 'attention' },
      { title: 'Motarro delay', type: 'notification_supplier', severity: 'urgent' },
    ], 2);
    expect(diverse).toHaveLength(2);
    expect(diverse.map((i) => categorizeFocusItem(i))).toEqual(expect.arrayContaining(['buying', 'supplier']));
  });

  it('uses contextual hero titles', () => {
    expect(focusHeroTitle(1)).toBe('1 thing requires your attention');
    expect(focusHeroTitle(3)).toBe('3 things require your attention');
  });

  it('builds business status for morning scan', () => {
    const status = buildBusinessStatus({
      focusToday: duplicateStockFocus,
      notifications: { businessHealthScore: 9.2, items: [] },
    });
    expect(status.label).toBe('Excellent');
    expect(status.percent).toBe(92);
    expect(status.emoji).toBe('🟢');
    expect(status.issues).toBeGreaterThan(0);
    expect(status.biggestOpportunity).toBeTruthy();
  });

  it('builds compact daily brief bullets', () => {
    const { bullets, detailSections } = buildDailyBriefBullets({
      focusToday: duplicateStockFocus,
      businessHealth: [
        { key: 'website', label: 'Website', severity: 'healthy', status: 'No changes' },
        { key: 'orders', label: 'Orders', severity: 'healthy', status: '2 orders yesterday' },
      ],
      whatChangedSinceYesterday: [{ type: 'orders', text: '2 orders yesterday', severity: 'healthy' }],
      notifications: { items: [] },
    });
    expect(bullets.length).toBe(4);
    expect(bullets[0].text).toMatch(/buying opportunit/);
    expect(detailSections.length).toBeGreaterThan(0);
  });

  it('teaches remember feature when empty', () => {
    expect(rememberEmptyCopy()).toBe('Nothing remembered yet.');
    expect(REMEMBER_TEACHING_TOPICS).toHaveLength(3);
  });

  it('builds proactive greeting without repeating focus count', () => {
    const { lead, lines } = buildProactiveGreeting(
      { focusToday: sampleFocus },
      { userName: 'Gee', hour: 9 },
    );
    expect(lead).toBe('Good morning Gee.');
    expect(lines[0]).toMatch(/Priority areas today/);
    expect(lines.some((l) => /important operational items/i.test(l))).toBe(false);
  });

  it('builds health card with bar, label, and maturity ladder', () => {
    const card = buildHealthCard({ notifications: { businessHealthScore: 9.3 } });
    expect(card.display).toBe('9.3');
    expect(card.label).toBe('Excellent');
    expect(card.bar).toMatch(/█/);
    expect(card.maturity).toEqual(OPERATIONAL_MATURITY);
    expect(card.maturity.filter((r) => r.status === 'earned')).toHaveLength(4);
  });

  it('formats Apollo Recommends with confidence only when evidence exists', () => {
    const withEvidence = buildApolloRecommends([{
      type: 'x', priority: 1, title: 'Wallet stock falling', action: 'Increase wallet order',
      evidence: 'Sales +31% · Stock cover 11 days',
      confidence: 96,
    }]);
    expect(withEvidence[0].title).toBe('Wallet stock falling');
    expect(withEvidence[0].confidence).toBe(96);
    expect(withEvidence[0].evidence.length).toBeGreaterThan(0);

    const noEvidence = buildApolloRecommends([{
      type: 'y', priority: 2, action: 'Call supplier',
      confidence: 90,
    }]);
    expect(noEvidence[0].confidence).toBeNull();
  });

  it('builds scan-friendly daily brief buckets', () => {
    const scan = buildDailyBriefScan({
      focusToday: [{ title: 'Wallet stock', severity: 'urgent', action: 'Review wallet stock' }],
      whatChangedSinceYesterday: [{ type: 'orders', text: '2 orders yesterday', severity: 'healthy' }],
    });
    expect(scan.risks.length).toBeGreaterThan(0);
    expect(scan.changes.length).toBeGreaterThan(0);
  });

  it('groups notifications by urgency buckets', () => {
    const grouped = groupNotificationsByUrgency([
      { id: '1', title: 'Container delayed', severity: 'critical' },
      { id: '2', title: 'Buying review', severity: 'attention' },
      { id: '3', title: 'Website change', severity: 'info' },
    ]);
    expect(grouped.immediate).toHaveLength(1);
    expect(grouped.today).toHaveLength(1);
    expect(grouped.info).toHaveLength(1);
  });

  it('prefixes product notifications and recommends with Proto codes', () => {
    const item = {
      title: 'BATTERY OPERATED CANDLE 6cm sales spiked',
      detail: 'BATCAND6 · appeared as an unexpected bestseller with 24 units',
      dedupeKey: 'exception:sales_anomaly:BATCAND6:spike',
      payload: { code: 'BATCAND6' },
    };
    expect(extractProductCode(item)).toBe('BATCAND6');
    expect(formatWithProductCode(item)).toBe('BATCAND6 · BATTERY OPERATED CANDLE 6cm sales spiked');

    const grouped = groupNotificationsByUrgency([{ ...item, severity: 'attention' }]);
    expect(grouped.today[0].displayTitle).toMatch(/^BATCAND6 · /);

    const recs = buildApolloRecommends([{
      type: 'notification_sales_anomaly',
      priority: 1,
      severity: 'attention',
      title: item.title,
      detail: item.detail,
      dedupeKey: item.dedupeKey,
      payload: item.payload,
      evidence: [{ label: 'Current quantity', value: 24 }],
      confidence: 90,
    }]);
    expect(recs[0].title).toMatch(/^BATCAND6 · /);
    expect(recs[0].code).toBe('BATCAND6');
  });

  it('builds knowledge health with business language before memory is live', () => {
    const health = buildKnowledgeHealth();
    expect(health.verifiedKnowledge).toBe(0);
    expect(health.knowledgeReused).toBe(0);
    expect(health.activeOperational).toBe(0);
    expect(health.decisionLessons).toBe(0);
    expect(health.purposeCopy).toContain('operational knowledge grows');
    expect(health.memoryStatusCopy).toContain('not yet been activated');
  });

  it('tracks Apollo responsibilities as earned or waiting', () => {
    expect(responsibilityStatusIcon('earned')).toBe('✓');
    expect(responsibilityStatusIcon('emerging')).toBe('△');
    expect(responsibilityStatusIcon('waiting')).toBe('○');
    const rows = buildApolloResponsibilities();
    expect(rows.find((r) => r.id === 'execution')?.icon).toBe('✓');
    expect(rows.find((r) => r.id === 'memory')?.note).toBe('Not yet earned');
    expect(rows.find((r) => r.id === 'reasoning')?.note).toBe('Waiting for Memory');
  });
});
