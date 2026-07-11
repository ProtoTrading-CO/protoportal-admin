import { describe, expect, it } from 'vitest';
import {
  APOLLO_BUSINESS_PRINCIPLES,
  APOLLO_KNOWLEDGE_TYPES,
  APOLLO_OPERATIONAL_PILLARS,
  BUSINESS_RULE_METRIC_KEYS,
  RULEBOOK_VERSION,
  RULE_GOVERNANCE_STATUSES,
  buildRuleGovernanceView,
  calculateRuleAccuracy,
  listApolloBusinessRules,
  resolveNegativeStockRules,
  summarizeBusinessRulesApplied,
} from '../../api/_apollo-business-rules.js';

describe('Apollo Rulebook', () => {
  it('versions Rulebook separately from Apollo UI', () => {
    expect(RULEBOOK_VERSION).toBe('1.0');
  });

  it('defines four operational brain pillars', () => {
    expect(APOLLO_OPERATIONAL_PILLARS.map((row) => row.id)).toEqual([
      'data',
      'knowledge',
      'rulebook',
      'decision_history',
    ]);
    expect(APOLLO_OPERATIONAL_PILLARS.find((row) => row.id === 'rulebook')?.tagline).toBe('How we think');
  });

  it('defines knowledge library types including reserved reference knowledge', () => {
    expect(APOLLO_KNOWLEDGE_TYPES).toHaveLength(5);
    const rules = APOLLO_KNOWLEDGE_TYPES.find((row) => row.id === 'business_rule');
    expect(rules?.storage).toBe('rulebook');
    const reference = APOLLO_KNOWLEDGE_TYPES.find((row) => row.id === 'reference');
    expect(reference?.status).toBe('reserved');
  });

  it('tracks rule governance draft validated institutional', () => {
    expect(RULE_GOVERNANCE_STATUSES).toEqual(['draft', 'validated', 'institutional']);
    const active = listApolloBusinessRules({ implementationStatus: 'active' });
    expect(active[0].governanceStatus).toBe('validated');
    expect(active[0].owner).toBe('Operations');
    expect(active[0].approvedBy).toBe('Gee');
    expect(active[0].documentationPath).toBe('docs/PROTO_RULEBOOK.md');
  });

  it('calculates rule accuracy from validation evidence', () => {
    expect(calculateRuleAccuracy({ observed: 417, falseAlarms: 5 })).toBe(98.8);
    const view = buildRuleGovernanceView({
      id: 'test',
      title: 'Negative Stock Timing',
      owner: 'Operations',
      approvedBy: 'Gee',
      lastReviewed: '2026-07-12',
      governanceStatus: 'institutional',
      implementationStatus: 'active',
      validation: { observed: 417, resolvedAutomatically: 412, investigations: 5, falseAlarms: 5 },
    });
    expect(view.validation.accuracy).toBe(98.8);
    expect(view.governanceStatus).toBe('institutional');
  });

  it('resolves scoped appliesTo with most specific match winning', () => {
    const defaultRules = resolveNegativeStockRules({ supplier: 'Other Co' });
    expect(defaultRules.gracePeriodHours).toBe(24);
    expect(defaultRules.appliesTo).toEqual({ dimension: 'default', match: null });

    const supplierRules = resolveNegativeStockRules({ supplier: 'Motarro' });
    expect(supplierRules.gracePeriodHours).toBe(48);
    expect(supplierRules.appliesTo).toEqual({ dimension: 'supplier', match: 'Motarro' });

    const warehouseRules = resolveNegativeStockRules({ warehouse: 'main' });
    expect(warehouseRules.gracePeriodHours).toBe(12);
    expect(warehouseRules.appliesTo).toEqual({ dimension: 'warehouse', match: 'main' });

    const departmentRules = resolveNegativeStockRules({ department: 'Toys', supplier: 'Motarro' });
    expect(departmentRules.appliesTo.dimension).toBe('supplier');
    expect(departmentRules.gracePeriodHours).toBe(48);
  });

  it('summarizes business rules applied today with full breakdown', () => {
    const summary = summarizeBusinessRulesApplied([
      { payload: { businessRuleApplied: true, businessRuleMetricKey: 'negative_stock_timing' } },
      { payload: { businessRuleApplied: true, businessRuleMetricKey: 'negative_stock_timing' } },
      { payload: { businessRuleApplied: true, businessRuleMetricKey: 'seasonal_buying' } },
      { payload: { expectedBehaviourSuppressed: true } },
    ]);

    expect(summary.total).toBe(3);
    expect(summary.breakdown).toHaveLength(Object.keys(BUSINESS_RULE_METRIC_KEYS).length);
    expect(summary.breakdown.find((row) => row.key === 'negative_stock_timing')?.count).toBe(2);
    expect(summary.breakdown.find((row) => row.key === 'seasonal_buying')?.count).toBe(1);
    expect(summary.breakdown.find((row) => row.key === 'container_delay')?.count).toBe(0);
  });

  it('encodes permanent operating principles', () => {
    expect(APOLLO_BUSINESS_PRINCIPLES[1]).toMatch(/operational timing/i);
  });
});
