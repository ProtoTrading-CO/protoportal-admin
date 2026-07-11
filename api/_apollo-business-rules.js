/**
 * Apollo Business Rules — Proto's accumulated operational knowledge.
 * Not software thresholds alone: institutional knowledge about how Proto runs.
 */

export const APOLLO_BUSINESS_PRINCIPLES = [
  'Never alert on expected business behaviour. Alert only on unexpected behaviour.',
  'Apollo must distinguish between operational timing and operational problems.',
];

/** @typedef {'business_rule'} ApolloKnowledgeType */

export const APOLLO_BUSINESS_RULES = {
  negativeStock: {
    id: 'negative_stock_grv_timing',
    knowledgeType: 'business_rule',
    title: 'Negative stock during GRV is expected',
    statement: 'Negative stock during GRV processing is operational timing, not a stock problem.',
    source: 'operations',
    confidence: 'verified',
    profiles: {
      default: {
        gracePeriodHours: 24,
        investigateBelow: -10,
        recentGrvHours: 8,
      },
      warehouse: {
        gracePeriodHours: 12,
        investigateBelow: -10,
        recentGrvHours: 6,
      },
      imports: {
        gracePeriodHours: 48,
        investigateBelow: -10,
        recentGrvHours: 12,
      },
    },
  },
};

/**
 * Resolve configurable thresholds for a product/context.
 * Profile keys: default | warehouse | imports (extend without code changes).
 */
export function resolveBusinessRuleConfig(ruleKey, product = {}, overrides = {}) {
  const rule = APOLLO_BUSINESS_RULES[ruleKey];
  if (!rule) return { ...overrides, principles: APOLLO_BUSINESS_PRINCIPLES };

  const profileKey = String(
    product?.stockProfile
    || product?.fulfillmentProfile
    || product?.profile
    || overrides.profile
    || 'default',
  ).toLowerCase();

  const profile = rule.profiles[profileKey] || rule.profiles.default;
  return {
    ruleId: rule.id,
    knowledgeType: rule.knowledgeType,
    ruleTitle: rule.title,
    profile: profileKey in rule.profiles ? profileKey : 'default',
    gracePeriodHours: profile.gracePeriodHours,
    investigateBelow: profile.investigateBelow,
    recentGrvHours: profile.recentGrvHours,
    principles: APOLLO_BUSINESS_PRINCIPLES,
    ...overrides,
  };
}

/** Back-compat alias used by negative-stock module */
export function resolveNegativeStockRules(product = {}, overrides = {}) {
  return resolveBusinessRuleConfig('negativeStock', product, overrides);
}

export function listApolloBusinessRules() {
  return Object.entries(APOLLO_BUSINESS_RULES).map(([key, rule]) => ({
    key,
    ...rule,
    principles: APOLLO_BUSINESS_PRINCIPLES,
  }));
}
