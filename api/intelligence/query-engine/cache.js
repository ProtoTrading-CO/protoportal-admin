/** In-memory per-instance cache (serverless-safe, no Redis in Phase 1). */

const store = new Map();

function stableStringify(value) {
  if (value == null) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function cacheKey(queryId, params) {
  return `${queryId}:${stableStringify(params || {})}`;
}

export function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set(key, value, ttlMs) {
  if (!ttlMs || ttlMs <= 0) return;
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function clearCache() {
  store.clear();
}
