/**
 * SQLProvider — abstraction over STMAST data sources.
 * Product Loader and future features consume this interface; connection
 * details stay isolated in _sql-stmast.js.
 *
 * Phase 2 stubs (searchProducts, getSupplierProducts) throw until implemented.
 */
import {
  fetchStmastRow,
  isStmastAccessConfigured,
  sqlRowToPreview,
  stmastSetupMessage,
} from './_sql-stmast.js';

export function isSqlConfigured() {
  return isStmastAccessConfigured();
}

export function getSqlSetupMessage() {
  return stmastSetupMessage();
}

export async function getProductByCode(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const row = await fetchStmastRow(normalized);
  return sqlRowToPreview(row);
}

export async function searchProducts(_term) {
  throw new Error('searchProducts not implemented — Phase 2');
}

export async function getSupplierProducts(_supplier) {
  throw new Error('getSupplierProducts not implemented — Phase 2');
}
