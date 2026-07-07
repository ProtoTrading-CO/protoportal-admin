import { adapters } from './adapters/index.js';
import { logRead } from './audit.js';
import * as cache from './cache.js';
import * as envelope from './envelope.js';
import { getQuery } from './registry.js';
import { validateParams, enforceMaxRows } from './read-guard.js';
import { bootstrapQueries } from './queries/index.js';

bootstrapQueries();

function withTimeout(promise, ms, queryId) {
  if (!ms || ms <= 0) return promise;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        const err = new Error(`Query timed out: ${queryId}`);
        err.code = 'QUERY_TIMEOUT';
        reject(err);
      }, ms);
    }),
  ]);
}

function countRows(result) {
  if (!result?.data) return 0;
  const { data } = result;
  if (Array.isArray(data)) return data.length;
  if (Array.isArray(data.rows)) return data.rows.length;
  if (data.customer || data.listing || data.product) return 1;
  if (data.customer === null || data.listing === null || data.product === null) return 0;
  return Object.keys(data).length ? 1 : 0;
}

/**
 * Execute a registered read-only query by id.
 * @param {string} queryId
 * @param {object} params
 * @param {{ actorEmail?: string, requestId?: string, bypassCache?: boolean }} ctx
 */
export async function executeQuery(queryId, params = {}, ctx = {}) {
  const def = getQuery(queryId);
  const safeParams = validateParams(def, params);
  const adapter = adapters[def.adapter];
  if (!adapter?.run) {
    return envelope.fail(
      { code: 'ADAPTER_MISSING', message: `No adapter: ${def.adapter}` },
      { source: [] },
    );
  }

  const key = cache.cacheKey(queryId, safeParams);
  if (!ctx.bypassCache && def.cacheTtlMs > 0) {
    const hit = cache.get(key);
    if (hit) {
      logRead({
        queryId,
        actor: ctx.actorEmail,
        params: safeParams,
        rowCount: countRows(hit),
        ms: 0,
        source: hit.meta?.source,
        cache: 'hit',
      });
      return envelope.withMeta(hit, { cache: 'hit', generatedAt: new Date().toISOString() });
    }
  }

  const started = Date.now();
  try {
    const raw = await withTimeout(adapter.run(def, safeParams, ctx), def.timeoutMs, queryId);
    const rowCount = countRows(raw);
    const warnings = [...(raw.warnings || [])];
    let data = raw.data;

    if (Array.isArray(data)) {
      data = enforceMaxRows(def, data);
      if (data.length < (raw.data?.length || 0)) {
        warnings.push(envelope.WARNING_CODES.PARTIAL_DATA);
      }
    }

    const result = envelope.ok(data, {
      source: raw.source || [],
      partial: raw.partial ?? false,
      cache: 'miss',
      warnings,
    });

    if (!ctx.bypassCache && def.cacheTtlMs > 0) {
      cache.set(key, result, def.cacheTtlMs);
    }

    logRead({
      queryId,
      actor: ctx.actorEmail,
      params: safeParams,
      rowCount,
      ms: Date.now() - started,
      source: raw.source,
      cache: 'miss',
    });

    return result;
  } catch (err) {
    logRead({
      queryId,
      actor: ctx.actorEmail,
      params: safeParams,
      rowCount: 0,
      ms: Date.now() - started,
      source: [],
      cache: 'bypass',
    });
    return envelope.fail(
      { code: err.code || 'QUERY_FAILED', message: err.message || 'Query failed' },
      { source: [] },
    );
  }
}

export { envelope, getQuery, bootstrapQueries };
export { listQueries, registerQuery, clearRegistry } from './registry.js';
