import { executeQuery } from '../../query-engine/execute.js';
import { WARNING_CODES } from '../../query-engine/envelope.js';
import { trustField, trustFromMeta, CONFIDENCE } from '../shared/trust.js';
import { contextEnvelope, firstImage, mergeContextMeta } from './_helpers.js';

const NOT_AVAILABLE = [
  'margin',
  'forecast',
  'yearly_sales_erp',
  'movement_history',
  'grv_history',
  'on_order',
  'last_sale',
];

const STATUS_LABELS = {
  live_on_website: 'Live on website',
  erp_only: 'In ERP — not on website',
  not_found: 'Not found',
};

export async function buildProductContext(params = {}, ctx = {}) {
  const code = String(params.code || params.q || '').trim().toUpperCase();
  if (!code) {
    return contextEnvelope('product', emptyProductShape(code), {}, 'product.context');
  }

  const [erpRes, listingRes] = await Promise.all([
    executeQuery('erp.product_by_code', { code }, ctx),
    executeQuery('stock.website_stock_by_sku', { sku: code }, ctx),
  ]);

  if (!erpRes.ok) return erpRes;
  if (!listingRes.ok) return listingRes;

  const erpDataSource = erpRes.data?.dataSource || null;
  const liveErp = erpDataSource === 'erp_sql';
  let erp = erpRes.data?.product || null;
  const website = listingRes.data?.listing || null;

  // Cache: enrichment only (supplier, barcode) when live ERP; full fallback when not.
  const cacheRes = await executeQuery('stock.stmast_cache_by_code', { code }, ctx);
  if (!cacheRes.ok) return cacheRes;
  const cacheRow = cacheRes.data?.row || null;

  if (!erp && cacheRow && !liveErp) {
    erp = cacheRowToErpPreview(cacheRow);
    erpRes.data = { ...erpRes.data, dataSource: 'stmast_cache' };
  }

  let sohRes = null;
  const skuForSoh = website?.sku || code;
  if (skuForSoh) {
    sohRes = await executeQuery('stock.products_soh_by_skus', { skus: skuForSoh }, ctx);
  }

  const warnings = [...(erpRes.meta?.warnings || []), ...(listingRes.meta?.warnings || [])];
  const notAvailable = [...NOT_AVAILABLE];
  const ts = erpRes.meta?.generatedAt || new Date().toISOString();

  if (!erp) notAvailable.push('erp_master');
  if (!website) notAvailable.push('website_listing');

  const sohRow = sohRes?.ok ? (sohRes.data?.products || [])[0] : null;
  const onHandRaw = sohRow?.available_stock ?? sohRow?.stock_qty
    ?? website?.available_stock ?? website?.stock_qty
    ?? erp?.available ?? erp?.onhand ?? null;

  let stockSource = 'erp_sql';
  if (sohRow) stockSource = 'products_table';
  else if (website?.available_stock != null || website?.stock_qty != null) stockSource = 'website_stock';
  else if (!liveErp && erp?.onhand != null) stockSource = 'stmast_cache';

  if (onHandRaw === null) {
    warnings.push(WARNING_CODES.STOCK_NOT_LINKED);
    notAvailable.push('stock_on_hand');
  }

  const statusCode = website ? 'live_on_website' : (erp ? 'erp_only' : 'not_found');
  const erpSource = liveErp ? 'erp_sql' : (erp ? 'stmast_cache' : null);

  const supplierName = cacheRow?.supplier || null;
  if (!supplierName) notAvailable.push('supplier');

  const department = liveErp
    ? (erp?.dept || null)
    : (erp?.dept || cacheRow?.dept || null);

  const priceRaw = liveErp
    ? (website?.price ?? erp?.price ?? null)
    : (website?.price ?? erp?.price ?? cacheRow?.price_a ?? null);

  let priceSource = 'erp_sql';
  if (website?.price != null) priceSource = 'website_stock';
  else if (!liveErp && cacheRow?.price_a != null && priceRaw != null) priceSource = 'stmast_cache';

  const evidence = {};

  evidence.code = trustField(code, { source: 'derived', confidence: CONFIDENCE.derived, timestamp: ts });

  if (erp?.title) {
    evidence.title = trustFromMeta(erp.title, erpSource, erpRes.meta);
  }
  if (priceRaw != null) {
    evidence.price = trustField(priceRaw, {
      source: priceSource,
      timestamp: priceSource === 'erp_sql' ? ts : (listingRes.meta?.generatedAt || ts),
      confidence: CONFIDENCE[priceSource],
    });
  }
  if (department) {
    evidence.department = trustField(department, {
      source: liveErp ? 'erp_sql' : (cacheRow?.dept ? 'stmast_cache' : erpSource),
      timestamp: ts,
      confidence: liveErp ? CONFIDENCE.erp_sql : CONFIDENCE.stmast_cache,
    });
  }
  if (erp?.onhand != null) {
    evidence.onHand = trustFromMeta(erp.onhand, erpSource, erpRes.meta);
  }
  if (erp?.booked != null) {
    evidence.booked = trustFromMeta(erp.booked, erpSource, erpRes.meta);
  }
  if (erp?.available != null) {
    evidence.available = trustFromMeta(erp.available, erpSource, erpRes.meta);
  }
  if (onHandRaw != null) {
    evidence.stockOnHand = trustField(onHandRaw, {
      source: stockSource,
      timestamp: sohRes?.meta?.generatedAt || listingRes.meta?.generatedAt || ts,
      confidence: CONFIDENCE[stockSource],
    });
  }
  if (supplierName) {
    evidence.supplier = trustFromMeta(supplierName, 'stmast_cache', cacheRes.meta);
  }
  if (cacheRow?.barcode || website?.barcode) {
    evidence.barcode = trustField(cacheRow?.barcode || website?.barcode, {
      source: cacheRow?.barcode ? 'stmast_cache' : 'website_stock',
      timestamp: cacheRes.meta?.generatedAt || listingRes.meta?.generatedAt || ts,
      confidence: cacheRow?.barcode ? CONFIDENCE.stmast_cache : CONFIDENCE.website_stock,
    });
  }
  if (website) {
    evidence.websiteStatus = trustField('live', {
      source: 'website_stock',
      timestamp: listingRes.meta?.generatedAt || ts,
      confidence: CONFIDENCE.website_stock,
    });
  }
  evidence.listingStatus = trustField(STATUS_LABELS[statusCode] || statusCode, {
    source: 'derived',
    timestamp: ts,
    confidence: CONFIDENCE.derived,
  });

  const context = {
    code,
    erp,
    erpDataSource: erpDataSource || (erp && cacheRow ? 'stmast_cache' : null),
    liveErp,
    website,
    stock: {
      onHand: onHandRaw,
      source: stockSource,
    },
    supplier: {
      name: supplierName,
      department,
      source: supplierName ? 'stmast_cache' : null,
    },
    imageUrl: firstImage(website?.image_url_one) || null,
    status: {
      code: statusCode,
      label: STATUS_LABELS[statusCode] || statusCode,
    },
    barcode: cacheRow?.barcode || website?.barcode || null,
    price: priceRaw,
    evidence,
    notAvailable,
  };

  const meta = mergeContextMeta([erpRes, listingRes, cacheRes, sohRes]);
  meta.warnings = [...new Set([...meta.warnings, ...warnings])];
  if (liveErp && !meta.source.includes('erp_sql')) {
    meta.source = ['erp_sql', ...meta.source];
  }
  return contextEnvelope('product', context, meta, 'product.context');
}

function cacheRowToErpPreview(row) {
  if (!row) return null;
  const onhand = Number(row.onhand) || 0;
  const booked = Number(row.booked) || 0;
  return {
    code: String(row.code || '').trim(),
    title: String(row.descr ?? row.description ?? '').trim(),
    price: Number(row.price_a) || 0,
    onhand,
    booked,
    available: onhand - booked,
    dept: String(row.dept || '').trim(),
  };
}

function emptyProductShape(code) {
  return {
    code,
    erp: null,
    erpDataSource: null,
    liveErp: false,
    website: null,
    stock: { onHand: null, source: null },
    supplier: { name: null, department: null, source: null },
    imageUrl: null,
    status: { code: 'not_found', label: STATUS_LABELS.not_found },
    barcode: null,
    price: null,
    evidence: {},
    notAvailable: [...NOT_AVAILABLE, 'erp_master', 'website_listing', 'supplier', 'stock_on_hand'],
  };
}
