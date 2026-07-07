/** Standard BI / query-engine response envelope. */

export const WARNING_CODES = {
  NOT_AVAILABLE: 'NOT_AVAILABLE',
  BRIDGE_OFFLINE: 'BRIDGE_OFFLINE',
  PARTIAL_DATA: 'PARTIAL_DATA',
  STOCK_NOT_LINKED: 'STOCK_NOT_LINKED',
  ERP_NOT_FOUND: 'ERP_NOT_FOUND',
};

function baseMeta(overrides = {}) {
  return {
    source: [],
    partial: false,
    generatedAt: new Date().toISOString(),
    cache: 'bypass',
    warnings: [],
    ...overrides,
  };
}

export function ok(data, meta = {}, intent = null) {
  return {
    ok: true,
    intent,
    data,
    meta: baseMeta(meta),
    error: null,
  };
}

export function fail(error, meta = {}, intent = null) {
  const normalized =
    typeof error === 'string'
      ? { code: 'QUERY_FAILED', message: error }
      : { code: error?.code || 'QUERY_FAILED', message: error?.message || 'Query failed' };

  return {
    ok: false,
    intent,
    data: null,
    meta: baseMeta(meta),
    error: normalized,
  };
}

export function withMeta(envelope, metaPatch) {
  if (!envelope || typeof envelope !== 'object') return envelope;
  return {
    ...envelope,
    meta: baseMeta({ ...envelope.meta, ...metaPatch }),
  };
}
