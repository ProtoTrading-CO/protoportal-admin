/**
 * Apollo Rulebook — Proto's judgment framework.
 * SOURCE OF TRUTH: docs/PROTO_RULEBOOK.md — code implements, does not define.
 * @see docs/APOLLO_ARCHITECTURE.md
 */

/** Rulebook evolves with the business; Apollo UI stays on its own version line. */
export const RULEBOOK_VERSION = '1.0';

export const APOLLO_BUSINESS_PRINCIPLES = [
  'Never alert on expected business behaviour. Alert only on unexpected behaviour.',
  'Apollo must distinguish between operational timing and operational problems.',
];

/** Four pillars of Apollo's operational brain. */
export const APOLLO_OPERATIONAL_PILLARS = [
  {
    id: 'data',
    label: 'Data',
    tagline: 'What is',
    question: 'What happened?',
    changesBecause: 'ERP transactions',
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    tagline: 'What we know',
    question: 'What have we learned?',
    changesBecause: 'Experience',
    storage: 'proto_memory',
  },
  {
    id: 'rulebook',
    label: 'Rulebook',
    tagline: 'How we think',
    question: 'How should we interpret this?',
    changesBecause: 'Business policy',
    storage: 'rulebook',
  },
  {
    id: 'decision_history',
    label: 'Decision History',
    tagline: 'What happened when',
    question: 'What happened after we decided?',
    changesBecause: 'Outcomes',
    storage: 'validation_outcomes',
  },
];

/** Knowledge library types — each answers a different business question. */
export const APOLLO_KNOWLEDGE_TYPES = [
  {
    id: 'business',
    label: 'Business Knowledge',
    purpose: 'Learned facts',
    example: 'Addie prefers black packaging',
    storage: 'proto_memory',
    status: 'active',
  },
  {
    id: 'decision',
    label: 'Decision Knowledge',
    purpose: 'Outcomes',
    example: 'Ordering extra wallets prevented stock-outs',
    storage: 'proto_memory',
    status: 'active',
  },
  {
    id: 'operational',
    label: 'Operational State',
    purpose: 'Temporary context',
    example: 'Container 58 awaiting customs',
    storage: 'proto_memory',
    status: 'active',
  },
  {
    id: 'business_rule',
    label: 'Business Rules',
    purpose: 'Operational judgment',
    example: 'Negative stock during GRV is expected',
    storage: 'rulebook',
    status: 'active',
  },
  {
    id: 'reference',
    label: 'Reference Knowledge',
    purpose: 'External policy and reference',
    example: 'Incoterms, VAT rules, supplier contracts',
    storage: 'reference_store',
    status: 'reserved',
  },
];

/** @deprecated Use APOLLO_KNOWLEDGE_TYPES */
export const APOLLO_KNOWLEDGE_ASSETS = APOLLO_KNOWLEDGE_TYPES.filter((row) => row.status !== 'reserved');

/** Rule governance lifecycle — documentation → implementation → evidence. */
export const RULE_GOVERNANCE_STATUSES = ['draft', 'validated', 'institutional'];

/** Code wiring status — separate from governance trust level. */
export const RULE_IMPLEMENTATION_STATUSES = ['planned', 'active'];

/** Metric keys for "business rules applied today" breakdown. */
export const BUSINESS_RULE_METRIC_KEYS = {
  negative_stock_timing: 'Negative Stock Timing',
  supplier_grace_period: 'Supplier Grace Period',
  container_delay: 'Container Delay',
  seasonal_buying: 'Seasonal Buying',
};

const SCOPE_PRECEDENCE = ['product', 'supplier', 'department', 'warehouse'];

const CONFIG_KEYS = ['gracePeriodHours', 'investigateBelow', 'recentGrvHours'];

function normalizeMatch(value) {
  return String(value || '').trim().toLowerCase();
}

function productDimensionValue(product, appliesTo) {
  switch (appliesTo) {
    case 'product':
      return product?.sku || product?.code || product?.productFamily || null;
    case 'supplier':
      return product?.supplier || null;
    case 'department':
      return product?.department || product?.category || product?.dept || null;
    case 'warehouse':
      return product?.warehouse
        || product?.fulfillmentProfile
        || product?.stockProfile
        || null;
    default:
      return null;
  }
}

function pickScopeConfig(scope) {
  const out = {};
  for (const key of CONFIG_KEYS) {
    if (scope[key] != null) out[key] = scope[key];
  }
  return out;
}

function scopeMatches(product, scope) {
  const field = productDimensionValue(product, scope.appliesTo);
  if (!field || !scope.match) return false;
  return normalizeMatch(field) === normalizeMatch(scope.match);
}

function resolveBestScope(rule, product) {
  let matched = null;
  let bestRank = Infinity;

  for (const scope of rule.scopes || []) {
    if (!scopeMatches(product, scope)) continue;
    const rank = SCOPE_PRECEDENCE.indexOf(scope.appliesTo);
    if (rank === -1) continue;
    if (rank < bestRank) {
      bestRank = rank;
      matched = scope;
    }
  }

  return matched;
}

export function calculateRuleAccuracy(validation = {}) {
  const observed = Number(validation.observed) || 0;
  const falseAlarms = Number(validation.falseAlarms) || 0;
  if (!observed) return null;
  return Math.round(((observed - falseAlarms) / observed) * 1000) / 10;
}

export function buildRuleGovernanceView(rule) {
  const validation = rule.validation || {};
  const accuracy = validation.accuracy ?? calculateRuleAccuracy(validation);
  return {
    id: rule.id,
    title: rule.title,
    metricLabel: rule.metricLabel,
    owner: rule.owner || null,
    approvedBy: rule.approvedBy || null,
    lastReviewed: rule.lastReviewed || null,
    governanceStatus: rule.governanceStatus || 'draft',
    implementationStatus: rule.implementationStatus || 'planned',
    validation: {
      observed: validation.observed ?? 0,
      resolvedAutomatically: validation.resolvedAutomatically ?? 0,
      investigations: validation.investigations ?? 0,
      falseAlarms: validation.falseAlarms ?? 0,
      accuracy,
    },
    documentationPath: 'docs/PROTO_RULEBOOK.md',
  };
}

export const APOLLO_BUSINESS_RULES = {
  negativeStock: {
    id: 'negative_stock_grv_timing',
    knowledgeType: 'business_rule',
    metricKey: 'negative_stock_timing',
    metricLabel: BUSINESS_RULE_METRIC_KEYS.negative_stock_timing,
    implementationStatus: 'active',
    governanceStatus: 'validated',
    owner: 'Operations',
    approvedBy: 'Gee',
    lastReviewed: '2026-07-12',
    title: 'Negative stock during GRV is expected',
    statement: 'Negative stock during GRV processing is operational timing, not a stock problem.',
    validation: {
      observed: 0,
      resolvedAutomatically: 0,
      investigations: 0,
      falseAlarms: 0,
      accuracy: null,
    },
    defaultConfig: {
      gracePeriodHours: 24,
      investigateBelow: -10,
      recentGrvHours: 8,
    },
    scopes: [
      { appliesTo: 'warehouse', match: 'main', gracePeriodHours: 12, recentGrvHours: 6 },
      { appliesTo: 'warehouse', match: 'imports', gracePeriodHours: 48, recentGrvHours: 12 },
      { appliesTo: 'supplier', match: 'Motarro', gracePeriodHours: 48, recentGrvHours: 12 },
      { appliesTo: 'department', match: 'Toys', gracePeriodHours: 24, recentGrvHours: 8 },
    ],
  },
  supplierGracePeriod: {
    id: 'supplier_grace_period',
    knowledgeType: 'business_rule',
    metricKey: 'supplier_grace_period',
    metricLabel: BUSINESS_RULE_METRIC_KEYS.supplier_grace_period,
    implementationStatus: 'planned',
    governanceStatus: 'draft',
    owner: 'Operations',
    approvedBy: null,
    lastReviewed: null,
    title: 'Supplier ships two days early',
    statement: 'Early shipment within the grace window is expected supplier behaviour.',
    validation: { observed: 0, resolvedAutomatically: 0, investigations: 0, falseAlarms: 0, accuracy: null },
    defaultConfig: { graceDays: 2 },
    scopes: [],
  },
  containerDelay: {
    id: 'container_eta_fluctuation',
    knowledgeType: 'business_rule',
    metricKey: 'container_delay',
    metricLabel: BUSINESS_RULE_METRIC_KEYS.container_delay,
    implementationStatus: 'planned',
    governanceStatus: 'draft',
    owner: 'Operations',
    approvedBy: null,
    lastReviewed: null,
    title: 'Container ETA changes under 12 hours',
    statement: 'Short ETA fluctuations during transit are operational timing, not delays.',
    validation: { observed: 0, resolvedAutomatically: 0, investigations: 0, falseAlarms: 0, accuracy: null },
    defaultConfig: { ignoreHours: 12 },
    scopes: [],
  },
  seasonalBuying: {
    id: 'seasonal_buying_pattern',
    knowledgeType: 'business_rule',
    metricKey: 'seasonal_buying',
    metricLabel: BUSINESS_RULE_METRIC_KEYS.seasonal_buying,
    implementationStatus: 'planned',
    governanceStatus: 'draft',
    owner: 'Buying',
    approvedBy: null,
    lastReviewed: null,
    title: 'Christmas buying begins in October',
    statement: 'Seasonal uplift before peak trading is expected buying behaviour.',
    validation: { observed: 0, resolvedAutomatically: 0, investigations: 0, falseAlarms: 0, accuracy: null },
    defaultConfig: { leadMonths: 2 },
    scopes: [],
  },
};

/**
 * Resolve configurable thresholds for a product/context.
 * Scopes match on supplier, department, warehouse, or product — most specific wins.
 */
export function resolveBusinessRuleConfig(ruleKey, product = {}, overrides = {}) {
  const rule = APOLLO_BUSINESS_RULES[ruleKey];
  if (!rule) return { ...overrides, principles: APOLLO_BUSINESS_PRINCIPLES, rulebookVersion: RULEBOOK_VERSION };

  const matchedScope = resolveBestScope(rule, product);
  const scopedConfig = matchedScope ? pickScopeConfig(matchedScope) : {};
  const base = { ...rule.defaultConfig, ...scopedConfig, ...overrides };

  return {
    ruleId: rule.id,
    ruleKey,
    knowledgeType: rule.knowledgeType,
    ruleTitle: rule.title,
    metricKey: rule.metricKey,
    metricLabel: rule.metricLabel,
    governanceStatus: rule.governanceStatus,
    rulebookVersion: RULEBOOK_VERSION,
    appliesTo: matchedScope
      ? { dimension: matchedScope.appliesTo, match: matchedScope.match }
      : { dimension: 'default', match: null },
    gracePeriodHours: base.gracePeriodHours,
    investigateBelow: base.investigateBelow,
    recentGrvHours: base.recentGrvHours,
    principles: APOLLO_BUSINESS_PRINCIPLES,
    ...overrides,
  };
}

/** Back-compat alias used by negative-stock module */
export function resolveNegativeStockRules(product = {}, overrides = {}) {
  return resolveBusinessRuleConfig('negativeStock', product, overrides);
}

export function listApolloBusinessRules({
  implementationStatus,
  governanceStatus,
  /** @deprecated */ status,
} = {}) {
  const implFilter = implementationStatus || status;
  return Object.entries(APOLLO_BUSINESS_RULES)
    .filter(([, rule]) => {
      if (implFilter && rule.implementationStatus !== implFilter) return false;
      if (governanceStatus && rule.governanceStatus !== governanceStatus) return false;
      return true;
    })
    .map(([key, rule]) => ({
      key,
      ...rule,
      ...buildRuleGovernanceView(rule),
      principles: APOLLO_BUSINESS_PRINCIPLES,
      rulebookVersion: RULEBOOK_VERSION,
    }));
}

export function countActiveBusinessRules() {
  return listApolloBusinessRules({ implementationStatus: 'active' }).length;
}

/** Rows where Apollo applied judgment from the Rulebook today. */
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
