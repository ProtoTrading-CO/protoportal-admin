#!/usr/bin/env node
/**
 * Apply Proto Product Report (SKU, Name, In Stock, Images).
 *
 * • In Stock = No  → archive live catalogue rows
 * • In Stock = Yes → sync price/SOH from public.products; add missing SKUs (ERP only)
 * • Skips duplicates already on website_stock / archived_products
 *
 * Usage:
 *   node scripts/apply-proto-product-report.mjs data/proto-product-report.xlsx
 *   node scripts/apply-proto-product-report.mjs data/proto-product-report.xlsx --apply
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { existsSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { findProductBySku, fetchProductLookupMap } from '../api/_sku-match.js';
import { loadBundledTaxonomy, resolvePathFields } from './lib/taxonomy-paths.mjs';
import { inferCategoryPathFromName } from './lib/product-name-category.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DEFAULT_FILE = join(ROOT, 'data/proto-product-report.xlsx');

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const fileArg = process.argv.slice(2).find((a) => !a.startsWith('-'));
const filePath = fileArg || DEFAULT_FILE;

if (!existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

const url = process.env.VITE_STOCK_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_STOCK_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set VITE_STOCK_SUPABASE_URL + VITE_STOCK_SUPABASE_KEY');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const tree = loadBundledTaxonomy();

function normSku(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${v.getUTCMonth() + 1}-${v.getUTCFullYear()}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v));
  const s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) return s.replace(/\.0+$/, '');
  return s;
}

function parseInStock(val) {
  const v = String(val ?? '').trim().toLowerCase();
  if (v === 'yes' || v === 'y') return true;
  if (v === 'no' || v === 'n') return false;
  return null;
}

function extractBarcodeFromName(name) {
  const m = String(name || '').match(/\(([^)]+)\)\s*$/);
  return m ? m[1].trim() : '';
}

function imageUrls(row) {
  return ['Image 1', 'Image 2', 'Image 3', 'Image 4', 'Image 5', 'Image 6']
    .map((k) => String(row[k] || '').trim())
    .filter(Boolean);
}

function productPath(row) {
  return [row.category, row.subcategory_one, row.subcategory_two, row.subcategory_three, row.subcategory_four]
    .filter(Boolean)
    .join(' > ');
}

async function loadCatalogueMaps() {
  const liveBySku = new Map();
  const archivedBySku = new Map();
  const allSkus = new Set();

  for (const table of ['website_stock', 'archived_products']) {
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from(table)
        .select('id, sku, barcode, title, category, subcategory_one, subcategory_two, subcategory_three, subcategory_four, price, stock_qty, available_stock, image_url_one, image_url_two, image_url_three, image_url_four')
        .range(from, from + 999);
      if (error) throw error;
      for (const row of data || []) {
        const k = normSku(row.sku).toUpperCase();
        if (!k) continue;
        allSkus.add(k);
        if (row.barcode) allSkus.add(String(row.barcode).trim().toUpperCase());
        if (table === 'website_stock') liveBySku.set(k, row);
        else archivedBySku.set(k, row);
      }
      if (!data?.length || data.length < 1000) break;
      from += 1000;
    }
  }

  return { liveBySku, archivedBySku, allSkus };
}

function resolveErpProduct(lookupMap, sku, barcode) {
  return findProductBySku(lookupMap, sku) || (barcode ? findProductBySku(lookupMap, barcode) : null);
}

function buildCategoryFields(name, sku) {
  const path = inferCategoryPathFromName(name, sku);
  if (!path) return null;
  return resolvePathFields(tree, path);
}

function stockPatchFromErp(product) {
  const price = Number(product.sell_price);
  return {
    stock_qty: product.stock_qty ?? 0,
    available_stock: product.available_stock ?? product.stock_qty ?? 0,
    ...(Number.isFinite(price) && price > 0 ? { price } : {}),
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const sheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });
  console.log(`Loaded ${rows.length} rows from ${filePath}\n`);

  const { liveBySku, archivedBySku, allSkus } = await loadCatalogueMaps();
  console.log(`Catalogue: ${liveBySku.size} live SKUs\n`);

  const report = [];
  const erpKeys = new Set();

  for (const row of rows) {
    const sku = normSku(row.SKU);
    const name = String(row.Name || row.name || '').trim();
    const inStock = parseInStock(row['In Stock'] ?? row['In stock']);
    if (inStock === null) continue;
    if (!sku) {
      report.push({ action: 'skip', reason: 'missing_sku', name });
      continue;
    }
    const barcode = extractBarcodeFromName(name);
    erpKeys.add(sku);
    if (barcode) erpKeys.add(barcode);
    report.push({ sku, name, inStock, barcode, images: imageUrls(row) });
  }

  const lookupMap = await fetchProductLookupMap(
    sb,
    [...erpKeys],
    'sku, description, sell_price, stock_qty, available_stock, units_of_issue',
  );

  const stats = {
    archive: 0,
    syncLive: 0,
    categorize: 0,
    insert: 0,
    skipArchived: 0,
    skipNoErp: 0,
    skipDuplicate: 0,
    skipNotOnSite: 0,
    errors: 0,
  };
  const log = [];

  for (const item of report) {
    if (item.action === 'skip') continue;

    const skuKey = item.sku.toUpperCase();
    const live = liveBySku.get(skuKey);
    const archived = archivedBySku.get(skuKey);
    const erp = resolveErpProduct(lookupMap, item.sku, item.barcode);

    if (!item.inStock) {
      if (live) {
        if (APPLY) {
          const { error } = await sb.rpc('archive_product', { p_sku: item.sku, p_by: 'proto-report' });
          if (error) { stats.errors++; log.push({ sku: item.sku, action: 'archive', error: error.message }); }
          else { stats.archive++; log.push({ sku: item.sku, action: 'archived' }); }
        } else {
          stats.archive++;
          log.push({ sku: item.sku, action: 'would_archive' });
        }
      } else {
        stats.skipNotOnSite++;
      }
      continue;
    }

    // In stock = Yes
    if (live) {
      const patch = erp ? stockPatchFromErp(erp) : { updated_at: new Date().toISOString() };
      const catFields = buildCategoryFields(item.name, item.sku);
      let needsCat = false;
      if (catFields && (
        live.category !== catFields.category
        || (live.subcategory_one || null) !== (catFields.subcategory_one || null)
        || (live.subcategory_two || null) !== (catFields.subcategory_two || null)
        || (live.subcategory_three || null) !== (catFields.subcategory_three || null)
      )) {
        // Only recategorize when loose or only one level deep
        if (!live.subcategory_two || live.subcategory_one === live.category) {
          Object.assign(patch, catFields);
          needsCat = true;
        }
      }

      if (APPLY) {
        const { error } = await sb.from('website_stock').update(patch).eq('sku', item.sku);
        if (error) { stats.errors++; log.push({ sku: item.sku, action: 'sync', error: error.message }); }
        else {
          stats.syncLive++;
          if (needsCat) stats.categorize++;
          log.push({ sku: item.sku, action: needsCat ? 'synced+categorized' : 'synced', from: productPath(live) });
        }
      } else {
        stats.syncLive++;
        if (needsCat) stats.categorize++;
      }
      continue;
    }

    if (archived) {
      stats.skipArchived++;
      continue;
    }

    if (allSkus.has(skuKey) || (item.barcode && allSkus.has(item.barcode.toUpperCase()))) {
      stats.skipDuplicate++;
      continue;
    }

    if (!erp) {
      stats.skipNoErp++;
      log.push({ sku: item.sku, action: 'skip_no_erp', name: item.name.slice(0, 50) });
      continue;
    }

    const catFields = buildCategoryFields(item.name, item.sku);
    if (!catFields) {
      stats.skipNoErp++;
      log.push({ sku: item.sku, action: 'skip_no_category', name: item.name.slice(0, 50) });
      continue;
    }

    const imgs = item.images;
    const insertRow = {
      sku: item.sku,
      barcode: erp.sku,
      title: item.name || erp.description || item.sku,
      original_description: item.name || erp.description || item.sku,
      ...catFields,
      ...stockPatchFromErp(erp),
      image_url_one: imgs[0] || null,
      image_url_two: imgs[1] || null,
      image_url_three: imgs[2] || null,
      image_url_four: imgs[3] || null,
    };

    if (APPLY) {
      const { error } = await sb.from('website_stock').insert(insertRow);
      if (error) {
        stats.errors++;
        log.push({ sku: item.sku, action: 'insert', error: error.message });
      } else {
        stats.insert++;
        allSkus.add(skuKey);
        liveBySku.set(skuKey, insertRow);
        log.push({ sku: item.sku, action: 'inserted', path: Object.values(catFields).filter(Boolean).join(' > ') });
        await sb.rpc('upsert_website_product_from_stock', { p_website_sku: item.sku });
      }
    } else {
      stats.insert++;
      log.push({ sku: item.sku, action: 'would_insert', path: Object.values(catFields).filter(Boolean).join(' > ') });
    }
  }

  if (APPLY) {
    const { error } = await sb.rpc('sync_website_from_products');
    if (error) console.warn('sync_website_from_products:', error.message);
  }

  console.log('Summary:', stats);
  const reportPath = join(ROOT, 'data/proto-product-report-apply-log.csv');
  const lines = ['sku,action,detail', ...log.map((l) => `${JSON.stringify(l.sku || '')},${l.action},${JSON.stringify(l.error || l.path || l.from || l.name || '')}`)];
  writeFileSync(reportPath, lines.join('\n'));
  console.log(`Log: ${reportPath}`);

  if (!APPLY) console.log('\nDRY RUN — re-run with --apply to commit.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
