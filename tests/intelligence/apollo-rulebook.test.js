import { describe, expect, it } from 'vitest';
import {
  APOLLO_BUSINESS_PRINCIPLES,
  APOLLO_KNOWLEDGE_ASSETS,
  BUSINESS_RULE_METRIC_KEYS,
  RULEBOOK_VERSION,
  resolveNegativeStockRules,
  summarizeBusinessRulesApplied,
} from '../../api/_apollo-business-rules.js';

describe('Apollo Rulebook', () => {
  it('versions Rulebook separately from Apollo UI', () => {
    expect(RULEBOOK_VERSION).toBe('1.0');
  });

  it('defines four knowledge assets with business rules as judgment framework', () => {
    expect(APOLLO_KNOWLEDGE_ASSETS).toHaveLength(4);
    const rules = APOLLO_KNOWLEDGE_ASSETS.find((row) => row.id === 'business_rule');
    expect(rules?.storage).toBe('rulebook');
    expect(rules?.purpose).toMatch(/interpret/i);
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
