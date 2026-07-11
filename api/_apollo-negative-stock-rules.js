/**
 * Proto business rule — negative stock is not automatically an exception.
 * Alert on unexpected behaviour only (GRV timing vs real discrepancy).
 */

export const PROTO_NEGATIVE_STOCK_RULES = {
  principle: 'Never alert on expected business behaviour. Alert only on unexpected behaviour.',
  persistenceThresholdHours: Number(process.env.APOLLO_NEGATIVE_STOCK_HOURS) || 24,
  recentGrvHours: Number(process.env.APOLLO_RECENT_GRV_HOURS) || 8,
  significantMagnitude: Number(process.env.APOLLO_NEGATIVE_STOCK_MAGNITUDE) || -10,
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

function readStockQty(product) {
  return num(product?.stockQty ?? product?.stockOnHand, null);
}

function productCode(product) {
  return String(product?.sku || product?.code || '').trim().toUpperCase();
}

function hasRecentGrv(product, now, recentGrvHours) {
  const at = product?.recentGrvAt || product?.grvReceivedAt || product?.lastGrvAt || null;
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

/**
 * Classify one negative-stock product for Proto operations.
 * @returns {null | object} classification with messaging and severity
 */
export function classifyNegativeStock(product, options = {}) {
  const stockQty = readStockQty(product);
  if (stockQty == null || stockQty >= 0) return null;

  const {
    now = new Date(),
    salesRank = product?.salesRank ?? null,
    existingByKey = null,
    rules = PROTO_NEGATIVE_STOCK_RULES,
  } = options;

  const code = productCode(product);
  const name = String(product?.title || product?.description || code || 'Product').trim();
  const supplier = String(product?.supplier || 'Unknown supplier').trim();
  const selling = salesRank != null && salesRank > 0;
  const recentGrv = hasRecentGrv(product, now, rules.recentGrvHours);
  const pendingGrv = hasPendingGrv(product);
  const negativeSince = resolveNegativeSince(product, existingByKey, code);
  const persistedHours = Math.round(hoursSince(negativeSince, now));
  const significant = stockQty <= rules.significantMagnitude;

  let kind = 'temporary_timing';
  if (recentGrv || pendingGrv) {
    kind = pendingGrv ? 'grv_in_progress' : 'temporary_timing';
  } else if (
    persistedHours >= rules.persistenceThresholdHours
    && !pendingGrv
    && !recentGrv
    && selling
    && significant
  ) {
    kind = 'investigate';
  }

  const meta = CLASSIFICATION[kind];
  const recommendation = kind === 'investigate'
    ? `Negative stock has persisted for ${persistedHours || rules.persistenceThresholdHours} hours with no matching GRV. Investigate inventory.`
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
    category: meta.category,
    severity: meta.severity,
    businessImpact: meta.businessImpact,
    stockBucket: meta.stockBucket,
    badgeKey: meta.badgeKey,
    urgency: meta.urgency,
    recommendation,
    title: `${meta.titleSuffix}: ${code} · ${name}`,
    detail: kind === 'investigate'
      ? `${code} · ${supplier} · ${stockQty} units · negative for ${persistedHours || rules.persistenceThresholdHours}+ hours`
      : `${code} · ${supplier} · temporary timing at ${stockQty}${selling ? ` · sales rank #${salesRank}` : ''}`,
    dedupeKey: `buying:${code}:${meta.dedupeSuffix}`,
    priorityBase: kind === 'investigate' ? 92 : 58,
    payload: {
      code,
      supplier,
      stockBucket: meta.stockBucket,
      negativeStockClass: kind,
      persistedHours,
      recentGrv,
      pendingGrv,
      salesRank: salesRank || null,
      protoBusinessRule: PROTO_NEGATIVE_STOCK_RULES.principle,
    },
  };
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
  const timing = classified.filter((row) => row.kind !== 'investigate');
  const investigate = classified.filter((row) => row.kind === 'investigate');
  return { classified, timing, investigate, total: classified.length };
}

/** Build Apollo notification rows for negative-stock products. */
export function buildNegativeStockNotifications(products = [], options = {}) {
  const salesItems = options.sales?.results || options.sales?.items || [];
  const salesByCode = new Map(salesItems.map((item, index) => [
    String(item.code || item.sku || '').trim().toUpperCase(),
    { ...item, rank: index + 1 },
  ]).filter(([code]) => code));

  return classifyNegativeStockList(products, {
    ...options,
    salesByCode,
  }).map((row) => {
    const sale = salesByCode.get(row.code);
    const salesBoost = sale ? Math.max(0, 14 - sale.rank) : 0;
    const priorityScore = Math.min(
      99,
      row.priorityBase + (row.kind === 'investigate' ? salesBoost : Math.min(4, salesBoost)),
    );

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
      actionLabel: row.kind === 'investigate' ? 'Investigate stock' : 'Acknowledge timing',
      actionUrl: '',
      priorityScore,
      dueAt: null,
      payload: {
        ...row.payload,
        salesRank: sale?.rank || null,
        query: `Show product ${row.code}`,
        release: 'apollo-operational-v1.2',
      },
    };
  });
}
