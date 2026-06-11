import { requireAdminKey } from './_admin-auth.js';
import { createClient } from '@supabase/supabase-js';
import { loadTaxonomy } from './_taxonomy-utils.js';

const PAGE_SIZE = 1000;

function getStockClient() {
  return createClient(
    process.env.VITE_STOCK_SUPABASE_URL,
    process.env.VITE_STOCK_SUPABASE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function fetchAllRows(supabase, table, { filter = null, orderBy = null } = {}) {
  const rows = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select('*');
    if (orderBy) q = q.order(orderBy, { ascending: true });
    q = q.range(from, from + PAGE_SIZE - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

/**
 * Server-side stock mutations + raw listings. Replaces direct browser access
 * to the stock Supabase project so its key never ships in the client bundle.
 */
export default async function handler(req, res) {
  if (!requireAdminKey(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { action } = req.body || {};
  const supabase = getStockClient();

  try {
    if (action === 'listLive') {
      const [rows, tree] = await Promise.all([
        fetchAllRows(supabase, 'website_stock', { orderBy: 'title' }),
        loadTaxonomy().catch(() => []),
      ]);
      return res.status(200).json({ rows, tree });
    }

    if (action === 'listArchived') {
      const { archivedBy = null, excludeArchivedBy = null } = req.body;
      const [rows, tree] = await Promise.all([
        fetchAllRows(supabase, 'archived_products', {
          orderBy: 'archived_at',
          filter: archivedBy ? (q) => q.eq('archived_by', archivedBy) : null,
        }),
        loadTaxonomy().catch(() => []),
      ]);
      const filtered = Array.isArray(excludeArchivedBy) && excludeArchivedBy.length
        ? rows.filter((r) => !excludeArchivedBy.includes(r.archived_by))
        : rows;
      return res.status(200).json({ rows: filtered, tree });
    }

    if (action === 'create') {
      const { row } = req.body;
      if (!row?.sku || !row?.barcode || !row?.title || !row?.category) {
        return res.status(400).json({ error: 'sku, barcode, title and category are required' });
      }
      const ALLOWED = new Set([
        'sku', 'barcode', 'title', 'original_description', 'price', 'category',
        'subcategory_one', 'subcategory_two', 'subcategory_three', 'subcategory_four',
        'image_url_one', 'image_url_two', 'image_url_three', 'image_url_four',
      ]);
      const clean = Object.fromEntries(Object.entries(row).filter(([k]) => ALLOWED.has(k)));
      const { error } = await supabase.from('website_stock').insert(clean);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'archive') {
      const { sku, by = 'product-manager' } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase.rpc('archive_product', { p_sku: sku, p_by: String(by).slice(0, 60) });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'unarchive') {
      const { sku } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase.rpc('unarchive_product', { p_sku: sku });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'recycleFromArchive') {
      const { sku, archivedBy } = req.body;
      if (!sku) return res.status(400).json({ error: 'sku required' });
      const { error } = await supabase
        .from('archived_products')
        .update({ archived_by: String(archivedBy || 'recycle-bin').slice(0, 60), archived_at: new Date().toISOString() })
        .eq('sku', sku);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err) {
    console.error('stock-actions error:', err.message);
    return res.status(500).json({ error: err.message || 'Stock action failed' });
  }
}
