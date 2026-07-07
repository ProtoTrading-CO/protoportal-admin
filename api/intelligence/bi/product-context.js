import { executeQuery } from '../../query-engine/execute.js';
import { ok, WARNING_CODES } from '../../query-engine/envelope.js';
import { fmtDate, mergeMeta, money, provenanceFootnote } from './shared/format.js';

const NOT_AVAILABLE_PRODUCT = [
  'margin',
  'forecast',
  'yearly_sales_erp',
  'movement_history',
  'grv_history',
];

export async function buildProductContext(params = {}, ctx = {}) {
  const code = String(params.code || params.q || '').trim().toUpperCase();
  if (!code) {
    return ok(null, {}, 'product.context');
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
  const listing = listingRes.data?.listing || null;
  const cacheRow = cacheRes.data?.row || null;

  let sohRes = null;
  const skuForSoh = listing?.sku || code;
  if (skuForSoh) {
    sohRes = await executeQuery('stock.products_soh_by_skus', { skus: [skuForSoh] }, ctx);
  }

  const warnings = [
    ...(erpRes.meta?.warnings || []),
    ...(listingRes.meta?.warnings || []),
  ];
  const notAvailable = [...NOT_AVAILABLE_PRODUCT];

  if (!erp) notAvailable.push('erp_master');
  if (!listing) notAvailable.push('website_listing');
  if (!cacheRow?.supplier) notAvailable.push('supplier');

  const sohRow = sohRes?.ok ? (sohRes.data?.products || [])[0] : null;
  const stockOnHand = sohRow?.available_stock ?? sohRow?.stock_qty
    ?? listing?.available_stock ?? listing?.stock_qty
    ?? erp?.available ?? erp?.onhand ?? null;

  if (stockOnHand === null) {
    warnings.push(WARNING_CODES.STOCK_NOT_LINKED);
    notAvailable.push('stock_on_hand');
  }

  const imageUrl = firstImage(listing?.image_url_one);
  const supplier = cacheRow?.supplier || null;
  const status = listing ? 'live_on_website' : (erp ? 'erp_only' : 'not_found');

  const data = {
    code,
    erp,
    website: listing,
    supplier,
    department: cacheRow?.dept || erp?.dept || null,
    stockOnHand,
    imageUrl,
    status,
    notAvailable,
    barcode: cacheRow?.barcode || listing?.barcode || null,
    price: listing?.price ?? erp?.price ?? cacheRow?.price_a ?? null,
  };

  const meta = mergeMeta([erpRes, listingRes, cacheRes, sohRes].filter(Boolean));
  meta.warnings = [...new Set([...meta.warnings, ...warnings])];
  return ok(data, meta, 'product.context');
}

function firstImage(url) {
  return String(url || '').split(',')[0].trim() || null;
}

export function formatProductContextMarkdown(envelope) {
  const { data, meta } = envelope;
  if (!data) return 'No product code provided.';

  if (data.status === 'not_found') {
    return `## Product ${data.code}\n\nNo ERP or website record found for this code.\n\n${provenanceFootnote(meta)}`;
  }

  const lines = [`## Product ${data.code}`, ''];

  if (data.imageUrl) {
    lines.push(`![${data.code}](${data.imageUrl})`, '');
  }

  const title = data.website?.title || data.erp?.title || data.code;
  lines.push(`### ${title}`, '');
  lines.push(`- **Status:** ${formatStatus(data.status)}`);

  if (data.erp) {
    lines.push(`- **ERP on hand:** ${data.erp.onhand ?? '—'} · **booked:** ${data.erp.booked ?? '—'} · **available:** ${data.erp.available ?? '—'}`);
    if (data.erp.price != null) lines.push(`- **ERP price:** ${money(data.erp.price)}`);
  }

  if (data.website) {
    lines.push(`- **Website SKU:** ${data.website.sku}`);
    lines.push(`- **Category:** ${data.website.category || '—'}`);
    if (data.website.price != null) lines.push(`- **Website price:** ${money(data.website.price)}`);
  }

  if (data.stockOnHand != null) {
    lines.push(`- **Stock on hand:** **${data.stockOnHand}** units`);
  } else {
    lines.push('- **Stock on hand:** not linked');
  }

  if (data.supplier) lines.push(`- **Supplier:** ${data.supplier}`);
  if (data.department) lines.push(`- **Department:** ${data.department}`);
  if (data.barcode) lines.push(`- **Barcode:** ${data.barcode}`);

  const missing = (data.notAvailable || []).filter((f) => !['website_listing', 'erp_master'].includes(f));
  if (missing.length) {
    lines.push('', '### Not available', missing.map((f) => `- ${f.replace(/_/g, ' ')}`).join('\n'));
  }

  lines.push('', provenanceFootnote(meta));
  return lines.join('\n');
}

function formatStatus(status) {
  if (status === 'live_on_website') return 'Live on website';
  if (status === 'erp_only') return 'In ERP — not on website';
  return 'Not found';
}
