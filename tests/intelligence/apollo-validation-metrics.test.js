import { describe, expect, it } from 'vitest';
import {
  buildDailyBriefScore,
  buildValidationReport,
  calculateBusinessValueScore,
  calculateTrustScore,
  calculateUsefulRate,
} from '../../api/_apollo-validation-metrics.js';

const exception = (overrides = {}) => ({
  category: 'sales_anomaly',
  confidence: 90,
  business_impact: 'high',
  payload: { release: 'apollo-operational-v1.2' },
  detected_at: '2026-07-10T08:00:00.000Z',
  ...overrides,
});

describe('Apollo validation metrics', () => {
  it('calculates trust and business value independently', () => {
    const rows = [
      exception({ feedback_status: 'useful', business_value: 'high', decision_outcome: 'action_taken' }),
      exception({ feedback_status: 'false_positive', business_value: 'none', decision_outcome: 'no_action_taken' }),
      exception({ feedback_status: 'useful', business_value: 'medium', decision_outcome: 'investigated' }),
    ];

    expect(calculateUsefulRate(rows)).toBe(66.7);
    expect(calculateTrustScore(rows)).toBeGreaterThan(0);
    expect(calculateBusinessValueScore(rows)).toBe(55);
  });

  it('builds daily brief score from today and yesterday rows', () => {
    const score = buildDailyBriefScore({
      todayRows: [
        exception({ detected_at: new Date().toISOString() }),
        { category: 'orders_overdue', detected_at: new Date().toISOString() },
      ],
      yesterdayRows: [
        exception({
          detected_at: new Date(Date.now() - 86_400_000).toISOString(),
          feedback_status: 'useful',
          business_value: 'high',
        }),
        exception({
          detected_at: new Date(Date.now() - 86_400_000).toISOString(),
          feedback_status: 'false_positive',
          business_value: 'none',
        }),
      ],
    });

    expect(score.notificationsGeneratedToday).toBe(2);
    expect(score.exceptionsGeneratedToday).toBe(1);
    expect(score.usefulExceptionsYesterday).toBe(1);
    expect(score.falsePositivesYesterday).toBe(1);
    expect(score.trustScore).not.toBeNull();
    expect(score.businessValueScore).toBe(50);
  });

  it('builds weekly validation report with detector insights and recommendation', () => {
    const report = buildValidationReport([
      exception({
        category: 'sales_anomaly',
        feedback_status: 'useful',
        business_value: 'high',
        decision_outcome: 'action_taken',
        confidence: 94,
      }),
      exception({
        category: 'stock_cover_risk',
        feedback_status: 'false_positive',
        business_value: 'none',
        decision_outcome: 'no_action_taken',
        confidence: 82,
      }),
      exception({
        category: 'stock_cover_risk',
        feedback_status: 'needs_threshold_adjustment',
        business_value: 'low',
        decision_outcome: 'investigated',
        confidence: 78,
      }),
      {
        category: 'orders_overdue',
        feedback_status: 'useful',
        payload: {},
      },
    ], { days: 7 });

    expect(report).toMatchObject({
      totalExceptions: 3,
      usefulExceptions: 1,
      falsePositives: 1,
      needsThresholdAdjustment: 1,
      reviewedExceptions: 3,
      trustScore: expect.any(Number),
      businessValueScore: 44,
      topValuableDetector: 'sales_anomaly',
      topNoisyDetector: 'stock_cover_risk',
      detectorWithHighestDecisionImpact: 'sales_anomaly',
      recommendation: expect.stringMatching(/tune_thresholds|extend_validation/),
    });
    expect(report.averageConfidenceByDetector.length).toBeGreaterThan(0);
    expect(report.averageBusinessImpactByDetector.length).toBeGreaterThan(0);
  });

  it('tracks expected behaviour suppressed and resolved automatically', () => {
    const report = buildValidationReport([
      exception({
        category: 'stock_timing',
        payload: {
          release: 'apollo-operational-v1.2',
          negativeStockClass: 'temporary_timing',
          expectedBehaviourSuppressed: true,
        },
      }),
      exception({
        category: 'stock_timing',
        payload: {
          release: 'apollo-operational-v1.2',
          negativeStockClass: 'grv_in_progress',
          expectedBehaviourSuppressed: true,
        },
      }),
      exception({
        category: 'stock_timing_resolved',
        payload: {
          release: 'apollo-operational-v1.2',
          negativeStockClass: 'resolved_automatically',
        },
      }),
    ], { days: 7 });

    expect(report.expectedBehaviourSuppressed).toBe(2);
    expect(report.resolvedAutomatically).toBe(1);
    expect(report.temporaryTimingResolvedRate).toBe(33.3);
  });

  it('includes suppressed and resolved counts in daily brief score', () => {
    const score = buildDailyBriefScore({
      todayRows: [
        exception({
          category: 'stock_timing',
          payload: {
            release: 'apollo-operational-v1.2',
            expectedBehaviourSuppressed: true,
          },
        }),
        exception({
          category: 'stock_timing_resolved',
          payload: {
            release: 'apollo-operational-v1.2',
            negativeStockClass: 'resolved_automatically',
          },
        }),
      ],
      yesterdayRows: [],
    });

    expect(score.expectedBehaviourSuppressedToday).toBe(1);
    expect(score.resolvedAutomaticallyToday).toBe(1);
  });
});
