import { describe, it, expect } from 'vitest';
import {
  buildApolloRecommends,
  buildDailyBriefScan,
  buildHealthCard,
  buildHeroFocusItems,
  buildProactiveGreeting,
  dedupeFocusForDisplay,
  focusHeroTitle,
  groupNotificationsByUrgency,
  OPERATIONAL_MATURITY,
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
  it('builds up to three deduped hero focus items with specific titles', () => {
    const rows = buildHeroFocusItems(duplicateStockFocus);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(rows.length).toBe(3);
    expect(rows[0].label).toMatch(/Wallet A/);
    expect(rows[1].label).toMatch(/Wallet B/);
    expect(new Set(rows.map((r) => r.label)).size).toBe(rows.length);
  });

  it('dedupes focus items by title and generic recommendation', () => {
    const distinct = dedupeFocusForDisplay(duplicateStockFocus, 5);
    expect(distinct).toHaveLength(4);
  });

  it('uses contextual hero titles', () => {
    expect(focusHeroTitle(1)).toBe('1 thing requires your attention');
    expect(focusHeroTitle(3)).toBe('3 things require your attention');
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
});
