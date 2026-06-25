import { fetchStmastRow, isStmastAccessConfigured, sqlRowToPreview, toSqlPreview } from './_sql-stmast.js';
import { fetchFromCache } from './_stmast-cache.js';

// Always true — stmast_cache is available via existing Supabase credentials
export function isSqlConfigured() {
  return true;
}

export async function getProductByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;

  // 1. Bridge / direct SQL (when STOCK_SQL_BRIDGE_URL or SQL_PASSWORD is configured)
  if (isStmastAccessConfigured()) {
    try {
      const row = await fetchStmastRow(normalized);
      if (row) return toSqlPreview(row);
    } catch (_) {
      // bridge unavailable — fall through to cache
    }
  }

  // 2. Supabase stmast_cache (imported from Proto Master Items CSV)
  return fetchFromCache(normalized);
}

export async function searchProducts(_term) {
  throw new Error('searchProducts not implemented — Phase 2');
}

export async function getSupplierProducts(_supplier) {
  throw new Error('getSupplierProducts not implemented — Phase 2');
}
