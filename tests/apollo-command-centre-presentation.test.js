import { describe, it, expect } from 'vitest';
import {
  buildApolloInfluence,
  buildApolloRecommends,
  buildBusinessStatus,
  buildBusinessSummaryLines,
  buildDailyBriefBullets,
  buildDailyBriefScan,
  buildConfidenceChip,
  buildEventBadge,
  buildImpactBadge,
  buildPriorityBadge,
  buildWhyToday,
  confidenceLevelText,
  focusUrgencyLabel,
  formatApolloRelativeTime,
  buildHealthCard,
  buildHeroFocusItems,
  buildKnowledgeHealth,
  buildApolloResponsibilities,
  buildOperationalObjectView,
  buildEvidenceMetrics,
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
    expect(status.headline).toBe('🟢 Business Very healthy');
    expect(status.lines.length).toBeGreaterThan(0);
    expect(status.detail.percent).toBe(92);
    expect(status.detail.healthScore).toBe('9.2');
    expect(status.biggestOpportunity).toBeTruthy();
  });

  it('builds narrative business summary lines without dashboard numbers on surface', () => {
    const status = { urgent: 0, issues: 2, opportunities: 2 };
    const lines = buildBusinessSummaryLines(status, {
      focusToday: [
        { type: 'notification_supplier', title: 'Motarro shipment delay', severity: 'urgent' },
      ],
      notifications: { items: [] },
    });
    expect(lines.some((l) => /buying opportunit/i.test(l))).toBe(true);
    expect(lines.some((l) => /supplier/i.test(l))).toBe(true);
  });

  it('builds apollo influence behavioural KPI', () => {
    const influence = buildApolloInfluence({
      notifications: {
        items: [{ decisionOutcome: 'order_placed', businessValue: 'high' }],
      },
    });
    expect(influence.decisionsToday).toBe(1);
    expect(influence.headline).toMatch(/influenced 1 business decision/);
  });

  it('celebrates business rules applied in apollo influence', () => {
    const influence = buildApolloInfluence({
      notifications: {
        items: [
          { payload: { businessRuleApplied: true, businessRuleMetricKey: 'negative_stock_timing' } },
          { payload: { businessRuleApplied: true, businessRuleMetricKey: 'negative_stock_timing' } },
          { payload: { businessRuleApplied: true, businessRuleMetricKey: 'seasonal_buying' } },
        ],
      },
    });
    expect(influence.rulesAppliedToday).toBe(3);
    expect(influence.headline).toMatch(/Business rules applied today: 3/);
    expect(influence.rulesAppliedBreakdown.find((row) => row.key === 'negative_stock_timing')?.count).toBe(2);
  });

  it('celebrates expected behaviour suppressed in apollo influence', () => {
    const influence = buildApolloInfluence({
      notifications: {
        items: [
          { payload: { expectedBehaviourSuppressed: true, negativeStockClass: 'temporary_timing' } },
          { payload: { expectedBehaviourSuppressed: true, negativeStockClass: 'grv_in_progress' } },
        ],
      },
    });
    expect(influence.suppressedToday).toBe(2);
    expect(influence.headline).toMatch(/Expected behaviour suppressed: 2 today/);
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
      payload: {
        evidence: [{ label: 'Stock cover', value: '11 days' }],
        confidence: 96,
      },
    }]);
    expect(withEvidence[0].title).toBe('Wallet stock falling');
    expect(withEvidence[0].confidence).toBe(96);
    expect(withEvidence[0].recommendationText).toBe('Increase wallet order');

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
      title: '8616700111 · BOUNCING BALL W/STRAP sales spiked',
      detail: '8616700111 · Motarro · appeared as an unexpected bestseller with 24 units',
      dedupeKey: 'exception:sales_anomaly:8616700111:spike',
      payload: {
        code: '8616700111',
        supplier: 'Motarro',
        department: 'TOYS',
        evidence: [
          { label: 'Current quantity', value: 24 },
          { label: 'Recent daily baseline', value: 0 },
        ],
        confidence: 90,
      },
    };
    const view = buildOperationalObjectView(item);
    expect(view.kind).toBe('product');
    expect(view.sku).toBe('8616700111');
    expect(view.description).toBe('BOUNCING BALL W/STRAP');
    expect(view.meta).toBe('TOYS • Motarro');
    expect(view.headline).toBe('Sales spiked');
    expect(view.eventBadge).toEqual({
      key: 'sales_spike',
      emoji: '🟢',
      label: 'SALES SPIKE',
      tone: 'green',
    });

    const grouped = groupNotificationsByUrgency([{ ...item, severity: 'attention' }]);
    expect(grouped.today[0].view.sku).toBe('8616700111');
    expect(grouped.today[0].view.eventBadge?.label).toBe('SALES SPIKE');

    const recs = buildApolloRecommends([{
      type: 'notification_sales_anomaly',
      priority: 1,
      severity: 'attention',
      ...item,
      action: 'Review stock cover before demand outruns supply.',
      confidence: 90,
    }]);
    expect(recs[0].view.sku).toBe('8616700111');
    expect(recs[0].metrics).toEqual([
      { label: 'ON HAND', value: 24 },
      { label: 'NORMAL SALES', value: '0/day' },
    ]);
    expect(recs[0].recommendationText).toBe('Review stock cover before demand outruns supply.');
    expect(recs[0].actionShort).toBe('Review stock cover');
    expect(recs[0].whyToday).toBe('Sales increased yesterday.');
    expect(recs[0].confidenceLevel).toBe('High confidence');
    expect(recs[0].summaryHeadline).toBe('BOUNCING BALL W/STRAP demand increasing');
    expect(recs[0].confidenceChip?.label).toBe('HIGH CONFIDENCE');
    expect(recs[0].impactBadge?.label).toBe('MEDIUM IMPACT');
    expect(recs[0].priorityBadge?.label).toBe('PRIORITY');
    expect(recs[0].confidence).toBe(90);
  });

  it('maps focus urgency labels for progressive disclosure', () => {
    expect(focusUrgencyLabel(1, 'urgent')).toBe('🔴 Do this first');
    expect(focusUrgencyLabel(2, 'attention')).toBe('🟡 Do next');
    expect(confidenceLevelText(90)).toBe('High confidence');
    expect(buildWhyToday({
      title: '8616700111 · BALL sales spiked',
      dedupeKey: 'exception:sales_anomaly:8616700111:spike',
    })).toBe('Sales increased yesterday.');
  });

  it('formats confidence, impact, priority, and relative time for evidence layer', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(buildConfidenceChip(90)).toMatchObject({ label: 'HIGH CONFIDENCE', value: '90%', tone: 'green' });
    expect(buildImpactBadge({ businessImpact: 'high' })?.label).toBe('HIGH IMPACT');
    expect(buildPriorityBadge({ priorityScore: 98 })).toMatchObject({ label: 'PRIORITY', value: '98', tone: 'red' });
    expect(formatApolloRelativeTime(fiveMinAgo)).toBe('5 minutes ago');
  });

  it('maps stock and supplier events to scan-friendly badges', () => {
    expect(buildEventBadge({
      title: 'Stock awaiting GRV: 8612300456 · BALL',
      category: 'stock_timing',
      payload: { negativeStockClass: 'temporary_timing', stockBucket: 'negative_timing' },
    })?.label).toBe('STOCK AWAITING GRV');
    expect(buildEventBadge({
      title: 'Stock discrepancy: 8612300456 · BALL',
      category: 'negative_stock_investigation',
      payload: { negativeStockClass: 'investigate' },
    })?.label).toBe('INVENTORY INVESTIGATION');
    expect(buildEventBadge({ title: '8612300456 · BALL low stock', payload: { stockBucket: 'low' } })?.label)
      .toBe('LOW STOCK');
    expect(buildEventBadge({ title: 'Supplier follow-up: Motarro', category: 'supplier_followups' })?.label)
      .toBe('SUPPLIER FOLLOW-UP');
  });

  it('formats customer and supplier operational objects by business identifier', () => {
    const customer = buildOperationalObjectView({
      type: 'inactive_customer',
      title: 'Addie — quiet for 32 days',
      detail: 'Usually orders every 14 days',
    });
    expect(customer.kind).toBe('customer');
    expect(customer.identifier).toBe('Addie');

    const supplier = buildOperationalObjectView({
      category: 'supplier_followups',
      title: 'Supplier follow-up: Motarro',
      payload: { supplier: 'Motarro' },
    });
    expect(supplier.kind).toBe('supplier');
    expect(supplier.identifier).toBe('Motarro');
  });

  it('builds knowledge health with business language before memory is live', () => {
    const health = buildKnowledgeHealth();
    expect(health.verifiedKnowledge).toBe(0);
    expect(health.knowledgeReused).toBe(0);
    expect(health.activeOperational).toBe(0);
    expect(health.decisionLessons).toBe(0);
    expect(health.purposeCopy).toContain('judgment');
    expect(health.memoryStatusCopy).toContain('not yet been activated');
  });

  it('tracks Apollo responsibilities as earned or waiting', () => {
    expect(responsibilityStatusIcon('earned')).toBe('✓');
    expect(responsibilityStatusIcon('emerging')).toBe('△');
    expect(responsibilityStatusIcon('waiting')).toBe('○');
    const rows = buildApolloResponsibilities();
    expect(rows.map((r) => r.id)).toEqual([
      'truth',
      'context',
      'knowledge',
      'rulebook',
      'reasoning',
      'advice',
      'execution',
      'coordination',
      'stewardship',
    ]);
    expect(rows.find((r) => r.id === 'execution')?.icon).toBe('✓');
    expect(rows.find((r) => r.id === 'knowledge')?.note).toBe('Proto Memory emerging');
    expect(rows.find((r) => r.id === 'rulebook')?.note).toBe('Rulebook v1.0 live');
    expect(rows.find((r) => r.id === 'reasoning')?.note).toBe('Combines Knowledge + Rulebook');
  });
});
