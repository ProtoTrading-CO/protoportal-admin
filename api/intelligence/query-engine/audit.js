/** Phase 1 audit — stdout only; no DB table yet. */

export function logRead({ queryId, actor, params, rowCount, ms, source, cache }) {
  const entry = {
    type: 'query_engine_read',
    queryId,
    actor: actor || 'system',
    rowCount: rowCount ?? 0,
    ms: ms ?? 0,
    source: source || [],
    cache: cache || 'miss',
    at: new Date().toISOString(),
    params: sanitizeParams(params),
  };
  console.log(JSON.stringify(entry));
}

function sanitizeParams(params) {
  if (!params || typeof params !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.length > 120) {
      out[k] = `${v.slice(0, 120)}…`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
