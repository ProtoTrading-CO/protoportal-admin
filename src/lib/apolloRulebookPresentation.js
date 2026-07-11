/** Client-safe Rulebook presentation — mirrors api/_apollo-business-rules.js metrics. */

export const RULEBOOK_VERSION = '1.0';

export const BUSINESS_RULE_METRIC_KEYS = {
  negative_stock_timing: 'Negative Stock Timing',
  supplier_grace_period: 'Supplier Grace Period',
  container_delay: 'Container Delay',
  seasonal_buying: 'Seasonal Buying',
};

export function summarizeBusinessRulesApplied(rows = []) {
  const applied = rows.filter((row) => row?.payload?.businessRuleApplied);
  const breakdown = Object.entries(BUSINESS_RULE_METRIC_KEYS).map(([key, label]) => ({
    key,
    label,
    count: applied.filter((row) => row.payload?.businessRuleMetricKey === key).length,
  }));

  return {
    total: applied.length,
    breakdown,
    rulebookVersion: RULEBOOK_VERSION,
  };
}

export function formatRulebookVersion(version = RULEBOOK_VERSION) {
  return `Rulebook v${version}`;
}
