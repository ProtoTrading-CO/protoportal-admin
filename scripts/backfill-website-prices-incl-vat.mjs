#!/usr/bin/env node
/**
 * Backfill website_stock + archived_products prices to VAT-inclusive (15%, rounded up).
 * Also runs sync_website_from_products() so ERP-linked rows pick up the new formula.
 *
 * Requires STOCK_SUPABASE_URL + STOCK_SUPABASE_KEY (or VITE_* equivalents).
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

async function backfillTable(sb, table) {
  const pageSize = 500;
  let from = 0;
  let updated = 0;
  while (true) {
    const { data, error } = await sb.from(table).select('sku, price').range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const next = websitePriceFromSellPrice(row.price);
      if (!next || next === Number(row.price)) continue;
      const { error: upErr } = await sb.from(table).update({ price: next, updated_at: new Date().toISOString() }).eq('sku', row.sku);
      if (upErr) throw upErr;
      updated += 1;
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return updated;
}

async function main() {
  const sb = getClient();
  const live = await backfillTable(sb, 'website_stock');
  const archived = await backfillTable(sb, 'archived_products');
  const { data: syncResult, error: syncErr } = await sb.rpc('sync_website_from_products');
  if (syncErr) console.warn('sync_website_from_products:', syncErr.message);
  console.log(JSON.stringify({ website_stock_updated: live, archived_products_updated: archived, sync: syncResult }, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
