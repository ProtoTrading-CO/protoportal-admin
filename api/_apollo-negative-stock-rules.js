/**
 * Proto negative-stock business rule — timing vs problems.
 * @see api/_apollo-business-rules.js
 */

import {
  APOLLO_BUSINESS_PRINCIPLES,
  resolveNegativeStockRules,
} from './_apollo-business-rules.js';

export { APOLLO_BUSINESS_PRINCIPLES, resolveNegativeStockRules };

/** @deprecated Use resolveNegativeStockRules() per product */
export const PROTO_NEGATIVE_STOCK_RULES = {
  principles: APOLLO_BUSINESS_PRINCIPLES,
};

const CLASSIFICATION = {
  temporary_timing: {
    category: 'stock_timing',
    severity: 'review',
    businessImpact: 'low',
    stockBucket: 'negative_timing',
    badgeKey: 'stock_awaiting_grv',
    urgency: 'info',
    recommendation: 'Temporary stock timing during GRV processing. No action required.',
    titleSuffix: 'Stock awaiting GRV',
    dedupeSuffix: 'negative-timing',
  },
  grv_in_progress: {
    category: 'stock_timing',
    severity: 'review',
    businessImpact: 'low',
    stockBucket: 'negative_timing',
    badgeKey: 'grv_in_progress',
    urgency: 'info',
    recommendation: 'Temporary stock timing during GRV processing. No action required.',
    titleSuffix: 'GRV in progress',
    dedupeSuffix: 'negative-timing',
  },
  investigate: {
    category: 'negative_stock_investigation',
    severity: 'action',
    businessImpact: 'high',
    stockBucket: 'negative_investigate',
    badgeKey: 'inventory_investigation',
    urgency: 'immediate',
    recommendation: null,
    titleSuffix: 'Stock discrepancy',
    dedupeSuffix: 'negative-investigate',
  },
  resolved_automatically: {
    category: 'stock_timing_resolved',
    severity: 'info',
    businessImpact: 'low',
    stockBucket: 'negative_resolved',
    badgeKey: 'resolved_automatically',
    urgency: 'info',
    recommendation: 'Stock returned positive without operator action. Apollo correctly treated this as GRV timing.',
    titleSuffix: 'Resolved automatically',
    dedupeSuffix: 'negative-resolved',
  },
};

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hoursSince(iso, now = new Date()) {
  if (!iso) return 0;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, (now.getTime() - then.getTime()) / 3_600_000);
}

function formatHoursAgo(hours) {
  const rounded = Math.max(1, Math.round(hours));
  if (rounded < 24) return `${rounded} hour${rounded === 1 ? '' : 's'} ago`;
  const days = Math.round(rounded / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function readStockQty(product) {
  return num(product?.stockQty ?? product?.stockOnHand, null);
}

function productCode(product) {
  return String(product?.sku || product?.code || '').trim().toUpperCase();
}

function grvTimestamp(product) {
  return product?.recentGrvAt || product?.grvReceivedAt || product?.lastGrvAt || null;
}

function hasRecentGrv(product, now, recentGrvHours) {
  const at = grvTimestamp(product);
  if (!at) return false;
  return hoursSince(at, now) <= recentGrvHours;
}

function hasPendingGrv(product) {
  return Boolean(
    product?.pendingGrv
    || product?.grvPending
    || product?.expectedInboundQty
    || product?.activeGrv,
  );
}

function resolveNegativeSince(product, existingByKey, code) {
  const direct = product?.negativeSince || product?.firstDetectedAt || product?.detectedAt || null;
  if (direct) return direct;

  if (!existingByKey || !code) return null;
  const keys = [
    `buying:${code}:negative-investigate`,
    `buying:${code}:negative-timing`,
    `buying:${code}:negative`,
  ];
  for (const key of keys) {
    const row = existingByKey.get?.(key) || existingByKey[key];
    if (row?.detected_at) return row.detected_at;
    if (row?.detectedAt) return row.detectedAt;
    if (row?.created_at) return row.created_at;
  }
  return null;
}

function buildReasoning({
  kind,
  recentGrv,
  pendingGrv,
  grvHoursAgo,
  persistedHours,
  selling,
  significant,
  rules,
  resolvedFrom,
}) {
  const bullets = [];

  if (kind === 'resolved_automatically') {
    if (resolvedFrom) bullets.push(`Previously flagged as ${resolvedFrom.replace(/_/g, ' ')}`);
    bullets.push('Stock is positive again without operator action');
    bullets.push('Pattern matches expected GRV timing at Proto');
    return bullets;
  }

  if (recentGrv && grvHoursAgo != null) {
    bullets.push(`GRV received ${formatHoursAgo(grvHoursAgo)}`);
  }
  if (pendingGrv) bullets.push('GRV is still being processed');
  if (selling) bullets.push('Sales posted while stock is negative');
  if (kind === 'temporary_timing' && !recentGrv && !pendingGrv) {
    bullets.push('No persistent discrepancy yet — treating as operational timing');
    bullets.push('Pattern matches previous GRV receipts at Proto');
  }
  if (kind === 'grv_in_progress') bullets.push('Inbound receipt expected to clear the timing difference');
  if (kind === 'investigate') {
    bullets.push(`Negative stock persisted ${persistedHours || rules.gracePeriodHours}+ hours`);
    bullets.push('No matching GRV found');
    if (selling) bullets.push('Product continues selling while negative');
    if (significant) bullets.push(`Magnitude is significant (below ${rules.investigateBelow} units)`);
  }

  return bullets.slice(0, 4);
}

function buildConfidence({ kind, recentGrv, pendingGrv, persistedHours, rules }) {
  if (kind === 'resolved_automatically') return { confidence: 92, level: 'high' };
  if (kind === 'investigate') {
    const base = 74 + Math.min(12, Math.max(0, persistedHours - rules.gracePeriodHours));
    return { confidence: Math.min(96, base), level: base >= 85 ? 'high' : 'medium' };
  }
  if (recentGrv || pendingGrv) return { confidence: 90, level: 'high' };
  return { confidence: 72, level: 'medium' };
}

function buildClassificationResult({
  kind,
  product,
  code,
  name,
  supplier,
  stockQty,
  persistedHours,
  selling,
  recentGrv,
  pendingGrv,
  significant,
  rules,
  salesRank,
  reasoning,
  confidence,
  confidenceLevel,
  resolvedFrom = null,
  previousTimingKey = null,
}) {
  const meta = CLASSIFICATION[kind];
  const recommendation = kind === 'investigate'
    ? `Negative stock has persisted for ${persistedHours || rules.gracePeriodHours} hours with no matching GRV. Investigate inventory.`
    : meta.recommendation;

  return {
    kind,
    code,
    name,
    supplier,
    stockQty,
    persistedHours,
    selling,
    recentGrv,
    pendingGrv,
    significant,
    rules,
    reasoning,
    confidence,
    confidenceLevel,
    category: meta.category,
    severity: meta.severity,
    businessImpact: meta.businessImpact,
    stockBucket: meta.stockBucket,
    badgeKey: meta.badgeKey,
    urgency: meta.urgency,
    recommendation,
    title: `${meta.titleSuffix}: ${code} · ${name}`,
    detail: kind === 'investigate'
      ? `${code} · ${supplier} · ${stockQty} units · negative for ${persistedHours || rules.gracePeriodHours}+ hours`
      : kind === 'resolved_automatically'
        ? `${code} · ${supplier} · stock corrected after GRV timing`
        : `${code} · ${supplier} · temporary timing at ${stockQty}${selling ? ` · sales rank #${salesRank}` : ''}`,
    dedupeKey: `buying:${code}:${meta.dedupeSuffix}`,
    priorityBase: kind === 'investigate' ? 92 : kind === 'resolved_automatically' ? 48 : 58,
    previousTimingKey,
    resolvedFrom,
    payload: {
      code,
      supplier,
      stockBucket: meta.stockBucket,
      negativeStockClass: kind,
      persistedHours,
      recentGrv,
      pendingGrv,
      salesRank: salesRank || null,
      reasoning,
      confidence,
      confidenceLevel,
      businessRuleId: rules.ruleId,
      businessRuleProfile: rules.profile,
      expectedBehaviourSuppressed: kind === 'temporary_timing' || kind === 'grv_in_progress',
      legacyAlertAvoided: kind === 'temporary_timing' || kind === 'grv_in_progress' ? 'negative_stock_urgent' : null,
      protoBusinessRule: APOLLO_BUSINESS_PRINCIPLES.join(' '),
      principles: APOLLO_BUSINESS_PRINCIPLES,
      release: 'apollo-operational-v1.2',
    },
  };
}

/**
 * Classify one negative-stock product for Proto operations.
 */
export function classifyNegativeStock(product, options = {}) {
  const stockQty = readStockQty(product);
  if (stockQty == null || stockQty >= 0) return null;

  const {
    now = new Date(),
    salesRank = product?.salesRank ?? null,
    existingByKey = null,
    rules = resolveNegativeStockRules(product, options.ruleOverrides),
  } = options;

  const code = productCode(product);
  const name = String(product?.title || product?.description || code || 'Product').trim();
  const supplier = String(product?.supplier || 'Unknown supplier').trim();
  const selling = salesRank != null && salesRank > 0;
  const grvAt = grvTimestamp(product);
  const grvHoursAgo = grvAt ? hoursSince(grvAt, now) : null;
  const recentGrv = hasRecentGrv(product, now, rules.recentGrvHours);
  const pendingGrv = hasPendingGrv(product);
  const negativeSince = resolveNegativeSince(product, existingByKey, code);
  const persistedHours = Math.round(hoursSince(negativeSince, now));
  const significant = stockQty <= rules.investigateBelow;

  let kind = 'temporary_timing';
  if (recentGrv || pendingGrv) {
    kind = pendingGrv ? 'grv_in_progress' : 'temporary_timing';
  } else if (
    persistedHours >= rules.gracePeriodHours
    && !pendingGrv
    && !recentGrv
    && selling
    && significant
  ) {
    kind = 'investigate';
  }

  const { confidence, level: confidenceLevel } = buildConfidence({
    kind, recentGrv, pendingGrv, persistedHours, rules,
  });
  const reasoning = buildReasoning({
    kind,
    recentGrv,
    pendingGrv,
    grvHoursAgo,
    persistedHours,
    selling,
    significant,
    rules,
  });

  return buildClassificationResult({
    kind,
    product,
    code,
    name,
    supplier,
    stockQty,
    persistedHours,
    selling,
    recentGrv,
    pendingGrv,
    significant,
    rules,
    salesRank,
    reasoning,
    confidence,
    confidenceLevel,
  });
}

/** Detect SKUs that were timing-negative and are now positive again. */
export function detectResolvedNegativeStock(existingByKey, currentNegativeProducts = [], options = {}) {
  if (!existingByKey) return [];

  const currentCodes = new Set(currentNegativeProducts.map((p) => productCode(p)).filter(Boolean));
  const resolved = [];
  const seen = new Set();

  const entries = existingByKey instanceof Map
    ? [...existingByKey.entries()]
    : Object.entries(existingByKey || {});

  for (const [key, row] of entries) {
    if (!String(key).includes('negative-timing')) continue;
    const code = String(key).match(/^buying:([^:]+):/)?.[1];
    if (!code || seen.has(code) || currentCodes.has(code)) continue;

    const priorClass = row?.payload?.negativeStockClass || 'temporary_timing';
    if (!['temporary_timing', 'grv_in_progress'].includes(priorClass)) continue;

    const name = row?.payload?.code === code
      ? String(row.title || '').split('·').pop()?.trim() || code
      : code;
    const supplier = row?.payload?.supplier || 'Unknown supplier';

    seen.add(code);
    const rules = resolveNegativeStockRules({ stockProfile: row?.payload?.businessRuleProfile }, options.ruleOverrides);
    const { confidence, level: confidenceLevel } = buildConfidence({ kind: 'resolved_automatically', rules });
    const reasoning = buildReasoning({
      kind: 'resolved_automatically',
      rules,
      resolvedFrom: priorClass,
    });

    resolved.push(buildClassificationResult({
      kind: 'resolved_automatically',
      product: { sku: code, title: name, supplier },
      code,
      name,
      supplier,
      stockQty: 0,
      persistedHours: 0,
      selling: false,
      recentGrv: false,
      pendingGrv: false,
      significant: false,
      rules,
      salesRank: null,
      reasoning,
      confidence,
      confidenceLevel,
      resolvedFrom: priorClass,
      previousTimingKey: key,
    }));
  }

  return resolved;
}

export function classifyNegativeStockList(products = [], options = {}) {
  const salesItems = options.sales?.results || options.sales?.items || [];
  const salesByCode = options.salesByCode || new Map(salesItems.map((item, index) => [
    String(item.code || item.sku || '').trim().toUpperCase(),
    { ...item, rank: index + 1 },
  ]).filter(([code]) => code));

  return products
    .map((product) => {
      const code = productCode(product);
      const sale = salesByCode.get(code);
      return classifyNegativeStock(product, {
        ...options,
        salesRank: sale?.rank ?? product?.salesRank ?? null,
      });
    })
    .filter(Boolean);
}

export function summarizeNegativeStock(products = [], options = {}) {
  const classified = classifyNegativeStockList(products, options);
  const resolved = options.includeResolved === false
    ? []
    : detectResolvedNegativeStock(options.existingByKey, products, options);
  const timing = classified.filter((row) => row.kind === 'temporary_timing' || row.kind === 'grv_in_progress');
  const investigate = classified.filter((row) => row.kind === 'investigate');
  const suppressed = timing.length;
  return {
    classified,
    timing,
    investigate,
    resolved,
    total: classified.length,
    expectedBehaviourSuppressed: suppressed,
  };
}

function mapRowToNotification(row, sale) {
  const salesBoost = sale ? Math.max(0, 14 - sale.rank) : 0;
  const priorityScore = Math.min(
    99,
    row.priorityBase + (row.kind === 'investigate' ? salesBoost : Math.min(4, salesBoost)),
  );

  const evidence = [
    ...(row.reasoning || []).map((line) => ({ label: 'Reason', value: line })),
    { label: 'Confidence', value: `${row.confidence}% (${row.confidenceLevel})` },
  ];

  return {
    dedupeKey: row.dedupeKey,
    sourceType: 'buying_signal',
    sourceId: null,
    workspaceId: null,
    category: row.category,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    recommendation: row.recommendation,
    actionLabel: row.kind === 'investigate'
      ? 'Investigate stock'
      : row.kind === 'resolved_automatically'
        ? 'Acknowledge resolution'
        : 'Acknowledge timing',
    actionUrl: '',
    priorityScore,
    dueAt: null,
    payload: {
      ...row.payload,
      salesRank: sale?.rank || null,
      query: row.kind === 'resolved_automatically' ? null : `Show product ${row.code}`,
      evidence,
    },
  };
}

/** Build Apollo notification rows for negative-stock products. */
export function buildNegativeStockNotifications(products = [], options = {}) {
  const salesItems = options.sales?.results || options.sales?.items || [];
  const salesByCode = new Map(salesItems.map((item, index) => [
    String(item.code || item.sku || '').trim().toUpperCase(),
    { ...item, rank: index + 1 },
  ]).filter(([code]) => code));

  const active = classifyNegativeStockList(products, { ...options, salesByCode });
  const resolved = detectResolvedNegativeStock(options.existingByKey, products, options);

  return [...active, ...resolved].map((row) => mapRowToNotification(row, salesByCode.get(row.code)));
}

export function countExpectedBehaviourSuppressed(summaryOrProducts, options = {}) {
  const summary = Array.isArray(summaryOrProducts)
    ? summarizeNegativeStock(summaryOrProducts, options)
    : summaryOrProducts;
  return summary?.expectedBehaviourSuppressed ?? 0;
}
