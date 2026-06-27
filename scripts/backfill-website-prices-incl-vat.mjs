#!/usr/bin/env node
/**
 * Fast batched VAT backfill — avoids Supabase SQL Editor timeouts.
 * Pass 1: rows with decimal prices (ERP ex-VAT). Pass 2: whole-number rows
 * where website_stock.price still equals products.sell_price.
 */
import { createClient } from '@supabase/supabase-js';
import { websitePriceFromSellPrice } from '../lib/pricing.mjs';

function getClient() {
  const url = process.env.STOCK_SUPABASE_POOLER_URL
    || process.env.STOCK_SUPABASE_URL
    || process.env.VITE_STOCK_SUPABASE_URL;
  const key = process.env.STOCK_SUPABASE_KEY
    || process.env.VITE_STOCK_SUPABASE_KEY;
  if (!url || !key) throw new Error('Missing stock Supabase env vars');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function hasDecimalCents(price) {
  const n = Number(price);
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) > 0.001;
}

async function fetchAllSkus(sb, table) {
  const rows = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select('sku, price, barcode').range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return rows;
}

async function updateBatch(sb, table, updates) {
  const chunkSize = 40;
  let done = 0;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await Promise.all(chunk.map(({ sku, price }) =>
      sb.from(table).update({ price, updated_at: new Date().toISOString() }).eq('sku', sku)
    ));
    done += chunk.length;
    process.stderr.write(`\r  updated ${done}/${updates.length}`);
  }
  process.stderr.write('\n');
  return done;
}

async function backfillDecimals(sb, table, rows) {
  const updates = [];
  for (const row of rows) {
    if (!hasDecimalCents(row.price)) continue;
    const next = websitePriceFromSellPrice(row.price);
    if (next && next !== Number(row.price)) updates.push({ sku: row.sku, price: next });
  }
  if (!updates.length) return 0;
  return updateBatch(sb, table, updates);
}

async function backfillWholeMatchingErp(sb, rows) {
  const barcodes = [...new Set(rows.filter((r) => !hasDecimalCents(r.price) && r.barcode).map((r) => r.barcode))];
  const sellBySku = new Map();
  for (let i = 0; i < barcodes.length; i += 500) {
    const chunk = barcodes.slice(i, i + 500);
    const { data, error } = await sb.from('products').select('sku, sell_price').in('sku', chunk);
    if (error) throw error;
    for (const p of data || []) sellBySku.set(p.sku, Number(p.sell_price));
  }

  const updates = [];
  for (const row of rows) {
    if (hasDecimalCents(row.price)) continue;
    const sell = sellBySku.get(row.barcode);
    if (!sell || sell <= 0) continue;
    if (Math.abs(Number(row.price) - sell) > 0.001) continue;
    const next = websitePriceFromSellPrice(sell);
    if (next && next !== Number(row.price)) updates.push({ sku: row.sku, price: next });
  }
  if (!updates.length) return 0;
  return updateBatch(sb, 'website_stock', updates);
}

async function main() {
  const sb = getClient();
  console.log('Loading website_stock…');
  const live = await fetchAllSkus(sb, 'website_stock');
  console.log(`Pass 1: decimal ex-VAT prices (${live.filter((r) => hasDecimalCents(r.price)).length} rows)…`);
  const pass1 = await backfillDecimals(sb, 'website_stock', live);
  console.log(`Pass 2: whole-number rows still matching ERP sell_price…`);
  const pass2 = await backfillWholeMatchingErp(sb, live);
  console.log(`Done. website_stock updated: ${pass1 + pass2} (pass1=${pass1}, pass2=${pass2})`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
