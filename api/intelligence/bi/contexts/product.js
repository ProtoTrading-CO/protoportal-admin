import { executeQuery } from '../../query-engine/execute.js';
import { WARNING_CODES } from '../../query-engine/envelope.js';
import { contextEnvelope, firstImage, mergeContextMeta } from './_helpers.js';

const NOT_AVAILABLE = [
  'margin',
  'forecast',
  'yearly_sales_erp',
  'movement_history',
  'grv_history',
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

  const [erpRes, listingRes, cacheRes] = await Promise.all([
    executeQuery('erp.product_by_code', { code }, ctx),
    executeQuery('stock.website_stock_by_sku', { sku: code }, ctx),
    executeQuery('stock.stmast_cache_by_code', { code }, ctx),
  ]);

  if (!erpRes.ok) return erpRes;
  if (!listingRes.ok) return listingRes;
  if (!cacheRes.ok) return cacheRes;

  const erp = erpRes.data?.product || null;
  const website = listingRes.data?.listing || null;
  const cacheRow = cacheRes.data?.row || null;

  let sohRes = null;
  const skuForSoh = website?.sku || code;
  if (skuForSoh) {
    sohRes = await executeQuery('stock.products_soh_by_skus', { skus: [skuForSoh] }, ctx);
  }

  const warnings = [...(erpRes.meta?.warnings || []), ...(listingRes.meta?.warnings || [])];
  const notAvailable = [...NOT_AVAILABLE];

  if (!erp) notAvailable.push('erp_master');
  if (!website) notAvailable.push('website_listing');

  const sohRow = sohRes?.ok ? (sohRes.data?.products || [])[0] : null;
  const onHand = sohRow?.available_stock ?? sohRow?.stock_qty
    ?? website?.available_stock ?? website?.stock_qty
    ?? erp?.available ?? erp?.onhand ?? null;

  if (onHand === null) {
    warnings.push(WARNING_CODES.STOCK_NOT_LINKED);
    notAvailable.push('stock_on_hand');
  }

  const statusCode = website ? 'live_on_website' : (erp ? 'erp_only' : 'not_found');
  const supplierName = cacheRow?.supplier || null;
  if (!supplierName) notAvailable.push('supplier');

  const context = {
    code,
    erp,
    website,
    stock: {
      onHand,
      source: sohRow ? 'products_table' : (website ? 'website_stock' : (erp ? 'erp' : null)),
    },
    supplier: {
      name: supplierName,
      department: cacheRow?.dept || erp?.dept || null,
    },
    imageUrl: firstImage(website?.image_url_one) || null,
    status: {
      code: statusCode,
      label: STATUS_LABELS[statusCode] || statusCode,
    },
    barcode: cacheRow?.barcode || website?.barcode || null,
    price: website?.price ?? erp?.price ?? cacheRow?.price_a ?? null,
    notAvailable,
  };

  const meta = mergeContextMeta([erpRes, listingRes, cacheRes, sohRes]);
  meta.warnings = [...new Set([...meta.warnings, ...warnings])];
  return contextEnvelope('product', context, meta, 'product.context');
}

function emptyProductShape(code) {
  return {
    code,
    erp: null,
    website: null,
    stock: { onHand: null, source: null },
    supplier: { name: null, department: null },
    imageUrl: null,
    status: { code: 'not_found', label: STATUS_LABELS.not_found },
    barcode: null,
    price: null,
    notAvailable: [...NOT_AVAILABLE, 'erp_master', 'website_listing', 'supplier', 'stock_on_hand'],
  };
}
