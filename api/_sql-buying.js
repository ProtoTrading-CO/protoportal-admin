/**
 * Proto buying history provider.
 * Read-only stock snapshot + bounded monthly unit sales. Never accepts SQL text.
 */

import { assertReadOnlySql, mssqlReadOnlyConfig } from './_sql-readonly.js';

export const MAX_BUYING_SKUS = 500;
export const MAX_BUYING_MONTHS = 36;

export function normalizeBuyingSkus(raw) {
  const values = Array.isArray(raw)
    ? raw
    : String(raw || '').replace(/\r/g, '\n').replace(/,/g, '\n').split('\n');
  const seen = new Set();
  const skus = [];
  for (const value of values) {
    const sku = String(value || '').trim().toUpperCase();
    if (!sku) continue;
    if (sku.length > 64 || /[\u0000-\u001f]/.test(sku)) {
      const err = new Error('Each SKU must be 1-64 printable characters');
      err.code = 'INVALID_PARAMS';
      throw err;
    }
    if (!seen.has(sku)) {
      seen.add(sku);
      skus.push(sku);
    }
  }
  if (!skus.length) {
    const err = new Error('At least one SKU is required');
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  if (skus.length > MAX_BUYING_SKUS) {
    const err = new Error(`A maximum of ${MAX_BUYING_SKUS} unique SKUs is allowed`);
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return skus;
}

export function normalizeBuyingMonths(raw) {
  const parsed = Number(raw ?? 24);
  if (!Number.isFinite(parsed)) {
    const err = new Error('Months must be a number');
    err.code = 'INVALID_PARAMS';
    throw err;
  }
  return Math.min(MAX_BUYING_MONTHS, Math.max(1, Math.trunc(parsed)));
}

function bridgeHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = String(process.env.STOCK_SQL_BRIDGE_KEY || '').trim();
  if (key) headers['x-api-key'] = key;
  return headers;
}

function monthKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit',
  }).format(date);
}

function shiftMonth(date, monthsBack) {
  const copy = new Date(date);
  copy.setUTCDate(1);
  copy.setUTCHours(0, 0, 0, 0);
  copy.setUTCMonth(copy.getUTCMonth() - monthsBack);
  return copy;
}

function trailingUnits(monthly, window, requestedMonths, now = new Date()) {
  if (requestedMonths < window) return null;
  const keys = new Set(Array.from({ length: window }, (_, index) => monthKey(shiftMonth(now, index))));
  return monthly.reduce((sum, row) => keys.has(row.month) ? sum + (Number(row.units) || 0) : sum, 0);
}

export function buildBuyingHistory({ skus, months, productRows = [], salesRows = [], now = new Date() }) {
  const products = new Map(productRows.map((row) => [String(row.CODE ?? row.code ?? '').trim().toUpperCase(), row]));
  const sales = new Map(skus.map((sku) => [sku, []]));
  for (const row of salesRows) {
    const code = String(row.code ?? row.CODE ?? row.PRODUCT ?? '').trim().toUpperCase();
    if (!sales.has(code)) continue;
    sales.get(code).push({
      month: String(row.salesMonth ?? row.salesmonth ?? row.SALESMONTH ?? ''),
      units: Number(row.units ?? row.UNITS) || 0,
      salesValue: Number(row.salesValue ?? row.salesvalue ?? row.SALESVALUE) || 0,
      invoiceCount: Number(row.invoiceCount ?? row.invoicecount ?? row.INVOICECOUNT) || 0,
    });
  }

  const items = skus.map((code) => {
    const product = products.get(code);
    const monthlySales = (sales.get(code) || []).sort((a, b) => a.month.localeCompare(b.month));
    const onHand = product ? Number(product.ONHAND ?? product.onHand ?? product.onhand) || 0 : null;
    const booked = product ? Number(product.BOOKED ?? product.booked) || 0 : null;
    return {
      code,
      found: Boolean(product),
      description: product ? String(product.DESCR ?? product.description ?? '').trim() : null,
      department: product ? String(product.DEPT ?? product.department ?? '').trim() : null,
      priceA: product ? Number(product.PRICE_A ?? product.priceA) || 0 : null,
      onHand,
      booked,
      available: product ? onHand - booked : null,
      monthlySales,
      sales: {
        units3m: trailingUnits(monthlySales, 3, months, now),
        units6m: trailingUnits(monthlySales, 6, months, now),
        units12m: trailingUnits(monthlySales, 12, months, now),
        units24m: trailingUnits(monthlySales, 24, months, now),
        units36m: trailingUnits(monthlySales, 36, months, now),
        activeMonths: monthlySales.filter((row) => Number(row.units) !== 0).length,
        invoiceCount: monthlySales.reduce((sum, row) => sum + row.invoiceCount, 0),
      },
    };
  });

  return {
    items,
    meta: {
      dataSource: 'erp_sql',
      readOnly: true,
      generatedAt: now.toISOString(),
      months,
      requestedSkuCount: skus.length,
      foundSkuCount: items.filter((item) => item.found).length,
      missingSkuCount: items.filter((item) => !item.found).length,
      availableFields: ['stock', 'booked', 'department', 'priceA', 'monthlySales'],
      notAvailable: ['openPurchaseOrders', 'supplierPurchaseHistory', 'supplierLeadTime', 'moq', 'packSize'],
    },
  };
}

async function fetchViaBridge(skus, months) {
  const base = String(process.env.STOCK_SQL_BRIDGE_URL || '').trim().replace(/\/$/, '');
  if (!base) return null;
  const response = await fetch(`${base}/buying-history`, {
    method: 'POST',
    headers: bridgeHeaders(),
    body: JSON.stringify({ skus, months }),
    signal: AbortSignal.timeout(45000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(json.error || json.message || `SQL bridge failed (${response.status})`);
    err.code = response.status === 400 ? 'INVALID_PARAMS' : 'ERP_UNAVAILABLE';
    throw err;
  }
  return json;
}

function sqlParams(skus) {
  return skus.map((_, index) => `@sku${index}`).join(',');
}

async function fetchViaMssql(skus, months) {
  const config = mssqlReadOnlyConfig({ requestTimeout: 45000 });
  if (!config) return null;
  const sql = (await import('mssql')).default;
  const params = sqlParams(skus);
  const productQuery = `
    SELECT CODE, DESCR, PRICE_A, ONHAND, BOOKED, DEPT
    FROM dbo.STMAST
    WHERE CODE IN (${params})
  `;
  const salesQuery = `
    SELECT d.PRODUCT AS code,
      CONVERT(char(7), h.DATE, 126) AS salesMonth,
      SUM(CAST(d.QTY AS float)) AS units,
      SUM(CAST(d.TOTAL AS float)) AS salesValue,
      COUNT(DISTINCT h.INV_NO) AS invoiceCount
    FROM dbo.DBINVDT d
    INNER JOIN dbo.DBINVHD h ON h.INV_NO = d.INV_NO AND h.TYPE = d.TYPE
    WHERE h.DATE >= @start AND h.DATE <= @end
      AND d.PRODUCT IN (${params})
    GROUP BY d.PRODUCT, CONVERT(char(7), h.DATE, 126)
    ORDER BY d.PRODUCT, salesMonth
  `;
  assertReadOnlySql(productQuery);
  assertReadOnlySql(salesQuery);

  const now = new Date();
  const start = shiftMonth(now, months - 1);
  const pool = await sql.connect(config);
  try {
    const productRequest = pool.request();
    const salesRequest = pool.request().input('start', sql.DateTime, start).input('end', sql.DateTime, now);
    skus.forEach((sku, index) => {
      productRequest.input(`sku${index}`, sql.VarChar(64), sku);
      salesRequest.input(`sku${index}`, sql.VarChar(64), sku);
    });
    const [products, monthly] = await Promise.all([
      productRequest.query(productQuery), salesRequest.query(salesQuery),
    ]);
    return buildBuyingHistory({
      skus, months, productRows: products.recordset, salesRows: monthly.recordset, now,
    });
  } finally {
    await pool.close();
  }
}

export function isBuyingDataConfigured() {
  return Boolean(String(process.env.STOCK_SQL_BRIDGE_URL || '').trim() || String(process.env.SQL_PASSWORD || '').trim());
}

export async function fetchBuyingHistory({ skus: rawSkus, months: rawMonths = 24 } = {}) {
  const skus = normalizeBuyingSkus(rawSkus);
  const months = normalizeBuyingMonths(rawMonths);
  const result = process.env.STOCK_SQL_BRIDGE_URL
    ? await fetchViaBridge(skus, months)
    : await fetchViaMssql(skus, months);
  if (!result) {
    const err = new Error('Proto buying data is not configured');
    err.code = 'ERP_UNAVAILABLE';
    throw err;
  }
  return result;
}
