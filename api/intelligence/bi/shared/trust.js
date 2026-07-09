/** Trust envelope for Capability 1.1+ — every Product field exposes evidence. */

export const CONFIDENCE = {
  erp_sql: 0.98,
  stmast_cache: 0.72,
  stock_supabase: 0.92,
  website_stock: 0.9,
  products_table: 0.88,
  derived: 0.85,
  unknown: 0.5,
};

/**
 * @param {*} value
 * @param {{ source: string, confidence?: number, timestamp?: string|null }} opts
 */
export function trustField(value, { source, confidence, timestamp = null }) {
  const conf = confidence ?? CONFIDENCE[source] ?? CONFIDENCE.unknown;
  return {
    value,
    source,
    timestamp: timestamp || new Date().toISOString(),
    confidence: Math.round(conf * 100) / 100,
  };
}

export function trustFromMeta(value, source, meta) {
  return trustField(value, {
    source,
    timestamp: meta?.generatedAt || null,
    confidence: CONFIDENCE[source],
  });
}

export function readTrust(field) {
  if (field && typeof field === 'object' && 'value' in field) return field.value;
  return field;
}
